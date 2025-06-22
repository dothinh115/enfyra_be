import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { DynamicRepoService } from '../dynamic-repo/dynamic-repo.service';
import { TGqlDynamicContext } from '../utils/types/dynamic-context.type';
import { convertFieldNodesToFieldPicker } from './utils/field-string-convertor';
import * as vm from 'vm';
import { TableHandlerService } from '../table/table.service';
import { QueryEngine } from '../query-builder/query-engine.service';
import { throwGqlError } from './utils/throw-error';
import { RedisLockService } from '../common/redis-lock.service';
import { JwtService } from '@nestjs/jwt';
import { DataSourceService } from '../data-source/data-source.service';
import { loadAndCacheRoutes } from '../middleware/utils/load-and-cache-routes';
import { GLOBAL_ROUTES_KEY } from '../utils/constant';

@Injectable()
export class DynamicResolver {
  constructor(
    @Inject(forwardRef(() => TableHandlerService))
    private tableHandlerService: TableHandlerService,
    private queryEngine: QueryEngine,
    private redisLockService: RedisLockService,
    private jwtService: JwtService,
    private dataSourceService: DataSourceService,
  ) {}
  async dynamicResolver(
    tableName: string,
    args: {
      filter: any;
      page: number;
      limit: number;
      meta: 'filterCount' | 'totalCount' | '*';
      sort: string | string[];
      aggregate: any;
    },
    context: any,
    info: any,
  ) {
    const { mainTable, targetTables, user, handler } = await this.middleware(
      tableName,
      context,
      info,
    );

    const selections = info.fieldNodes?.[0]?.selectionSet?.selections || [];
    const fullFieldPicker = convertFieldNodesToFieldPicker(selections);
    const fieldPicker = fullFieldPicker
      .filter((f) => f.startsWith('data.'))
      .map((f) => f.replace(/^data\./, ''));

    const dynamicFindEntries = await Promise.all(
      [mainTable, ...targetTables]?.map(async (table) => {
        const dynamicRepo = new DynamicRepoService({
          fields: fieldPicker.join(','),
          filter: args.filter,
          page: Number(args.page ?? 1),
          tableName: table.name,
          limit: Number(args.limit ?? 10),
          tableHandlerService: this.tableHandlerService,
          dataSourceService: this.dataSourceService,
          queryEngine: this.queryEngine,
          ...(args.meta && { meta: args.meta }),
          ...(args.sort && { sort: args.sort }),
          ...(args.aggregate && { aggregate: args.aggregate }),
        });

        await dynamicRepo.init();

        const name =
          table.name === mainTable.name ? 'main' : (table.alias ?? table.name);

        return [name, dynamicRepo];
      }),
    );

    const dynamicFindMap = Object.fromEntries(dynamicFindEntries);

    const vmCxt: TGqlDynamicContext = {
      $errors: {
        throw400: (msg: string) => {
          throw new BadRequestException(msg);
        },
        throw401: () => {
          throw new UnauthorizedException();
        },
      },
      $helpers: {
        jwt: (payload: any, ext: string) =>
          this.jwtService.sign(payload, { expiresIn: ext }),
      },
      $args: args ?? {},
      $user: user ?? undefined,
      $repos: dynamicFindMap,
      $req: context.request,
    };

    const timeoutMs = 3000;

    const vmContext = vm.createContext({
      ...vmCxt,
    });

    try {
      const userHandler = handler?.trim();
      const defaultHandler = `return await $repos.main.find();`;

      if (!userHandler && !defaultHandler) {
        throw new BadRequestException('Không có handler tương ứng');
      }

      const scriptCode = `
              (async () => {
                "use strict";
                try {
                  ${userHandler || defaultHandler}
                } catch (err) {
                  throw err;
                }
              })()
            `;

      const script = new vm.Script(scriptCode);
      const result = await script.runInContext(vmContext, {
        timeout: timeoutMs,
      });

      const typeName = mainTable.name;
      return {
        data: result.data.map((row) => ({
          ...row,
          __typename: typeName,
        })),
        meta: result.meta || {},
      };
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      throw new BadRequestException(`Script error: ${error.message}`);
    }
  }

  private async middleware(mainTableName: string, context: any, info: any) {
    if (!mainTableName) {
      throwGqlError('400', 'Missing table name');
    }

    const method = '';
    let routes: any[] =
      (await this.redisLockService.get(GLOBAL_ROUTES_KEY)) ||
      (await loadAndCacheRoutes(
        method,
        this.dataSourceService,
        this.redisLockService,
      ));

    const currentRoute = routes.find(
      (route) => route.path === '/' + mainTableName,
    );

    const accessToken =
      context.request?.headers?.get('authorization')?.split('Bearer ')[1] || '';
    let decoded: any;

    try {
      decoded = this.jwtService.verify(accessToken);
    } catch {
      throwGqlError('401', 'Unauthorized');
    }

    const userRepo = this.dataSourceService.getRepository('user_definition');
    const user: any = await userRepo.findOne({
      where: { id: decoded.id },
      relations: ['role'],
    });

    this.canPass(currentRoute, user);

    const handler = currentRoute.handlers?.find(
      (handler: any) => handler.path === 'GQL_QUERY',
    );

    return {
      matchedRoute: currentRoute,
      user,
      handler,
      decodedToken: decoded,
      mainTable: currentRoute.mainTable,
      targetTables: currentRoute.targetTables,
    };
  }

  canPass(currentRoute: any, user: any) {
    const isEnabled = currentRoute.isEnabled;
    if (!isEnabled) {
      throwGqlError('404', 'NotFound');
    }
    const isPublished = currentRoute.publishedMethods?.includes('GQL_QUERY');

    if (isPublished) {
      return true;
    }

    if (!user) {
      throwGqlError('401', 'Invalid user');
    }

    const canPass =
      currentRoute.routePermissions?.find(
        (permission: any) => permission.role.id === user.role.id,
      ) || user.isRootAdmin;

    if (!canPass) {
      throwGqlError('403', 'Not allowed');
    }

    return true;
  }
}
