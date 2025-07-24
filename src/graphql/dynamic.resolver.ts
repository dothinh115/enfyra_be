import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
} from '@nestjs/common';
import { DynamicRepoService } from '../dynamic-repo/dynamic-repo.service';
import { TGqlDynamicContext } from '../utils/types/dynamic-context.type';
import { convertFieldNodesToFieldPicker } from './utils/field-string-convertor';
import { TableHandlerService } from '../table/table.service';
import { QueryEngine } from '../query-engine/query-engine.service';
import { throwGqlError } from './utils/throw-error';
import { RedisLockService } from '../redis/redis-lock.service';
import { JwtService } from '@nestjs/jwt';
import { DataSourceService } from '../data-source/data-source.service';
import { GLOBAL_ROUTES_KEY } from '../utils/constant';
import { HandlerExecutorService } from '../handler-executor/handler-executor.service';
import { RouteCacheService } from '../redis/route-cache.service';
import { SystemProtectionService } from '../dynamic-repo/system-protection.service';

@Injectable()
export class DynamicResolver {
  constructor(
    @Inject(forwardRef(() => TableHandlerService))
    private tableHandlerService: TableHandlerService,
    private queryEngine: QueryEngine,
    private redisLockService: RedisLockService,
    private jwtService: JwtService,
    private dataSourceService: DataSourceService,
    private handlerExecutorService: HandlerExecutorService,
    private routeCacheService: RouteCacheService,
    private systemProtectionService: SystemProtectionService,
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
    const { mainTable, targetTables, user } = await this.middleware(
      tableName,
      context,
      info,
    );

    const selections = info.fieldNodes?.[0]?.selectionSet?.selections || [];
    const fullFieldPicker = convertFieldNodesToFieldPicker(selections);
    const fieldPicker = fullFieldPicker
      .filter((f) => f.startsWith('data.'))
      .map((f) => f.replace(/^data\./, ''));
    const metaPicker = fullFieldPicker
      .filter((f) => f.startsWith('meta.'))
      .map((f) => f.replace(/^meta\./, ''));
    const query = {
      fields: fieldPicker.join(','),
      filter: args.filter,
      page: args.page,
      limit: args.limit,
      meta: metaPicker.join(',') as any,
      sort: args.sort,
      aggregate: args.aggregate,
    };
    const dynamicFindEntries = await Promise.all(
      [mainTable, ...targetTables]?.map(async (table) => {
        const dynamicRepo = new DynamicRepoService({
          query,
          tableName: table.name,
          tableHandlerService: this.tableHandlerService,
          dataSourceService: this.dataSourceService,
          queryEngine: this.queryEngine,
          routeCacheService: this.routeCacheService,
          systemProtectionService: this.systemProtectionService,
          currentUser: user,
        });

        await dynamicRepo.init();

        const name =
          table.name === mainTable.name ? 'main' : (table.alias ?? table.name);

        return [name, dynamicRepo];
      }),
    );

    const dynamicFindMap = Object.fromEntries(dynamicFindEntries);

    const handlerCtx: any = {
      $errors: {
        throw400: (msg: string) => {
          throwGqlError('400', msg);
        },
        throw401: () => {
          throwGqlError('401', 'unauthorized');
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

    try {
      const defaultHandler = `return await $ctx.$repos.main.find();`;

      const scriptCode = defaultHandler;

      const result = await this.handlerExecutorService.run(
        scriptCode,
        handlerCtx,
        5000,
      );

      return result;
    } catch (error) {
      throw new BadRequestException(`Script error: ${error.message}`);
    }
  }

  private async middleware(mainTableName: string, context: any, info: any) {
    if (!mainTableName) {
      throwGqlError('400', 'Missing table name');
    }

    let routes: any[] =
      (await this.redisLockService.get(GLOBAL_ROUTES_KEY)) ||
      (await this.routeCacheService.loadAndCacheRoutes());

    const currentRoute = routes.find(
      (route) => route.path === '/' + mainTableName,
    );

    const accessToken =
      context.request?.headers?.get('authorization')?.split('Bearer ')[1] || '';
    let decoded: any;

    const user = await this.canPass(currentRoute, accessToken);

    return {
      matchedRoute: currentRoute,
      user,
      decodedToken: decoded,
      mainTable: currentRoute.mainTable,
      targetTables: currentRoute.targetTables,
    };
  }

  async canPass(currentRoute: any, accessToken: string) {
    const isEnabled = currentRoute.isEnabled;
    if (!isEnabled) {
      throwGqlError('404', 'NotFound');
    }
    const isPublished = currentRoute.publishedMethods?.includes('GQL_QUERY');

    if (isPublished) {
      return undefined;
    }
    let decoded;
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

    if (!user) {
      throwGqlError('401', 'Invalid user');
    }
    const canPass =
      user.isRootAdmin ||
      currentRoute.routePermissions?.some(
        (permission: any) =>
          permission.role?.id === user.role?.id &&
          permission.methods?.includes('GQL_QUERY'),
      );

    if (!canPass) {
      throwGqlError('403', 'Not allowed');
    }

    return user;
  }
}
