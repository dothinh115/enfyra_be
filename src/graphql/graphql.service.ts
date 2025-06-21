import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnApplicationBootstrap,
  UnauthorizedException,
} from '@nestjs/common';
import { DataSourceService } from '../data-source/data-source.service';
import { createYoga } from 'graphql-yoga';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { GraphQLSchema } from 'graphql';
import { EntityMetadata } from 'typeorm';
import { generateTypeDefsFromTables } from './utils/generate-type-defs';
import { RedisLockService } from '../common/redis-lock.service';
import { GLOBAL_ROUTES_KEY } from '../utils/constant';
import { loadAndCacheRoutes } from '../middleware/utils/load-and-cache-routes';
import { throwGqlError } from './utils/throw-error';
import { JwtService } from '@nestjs/jwt';
import { DynamicRepoService } from '../dynamic-repo/dynamic-repo.service';
import { TGqlDynamicContext } from '../utils/types/dynamic-context.type';
import { TableHandlerService } from '../table/table.service';
import { QueryBuilderService } from '../query-builder/query-builder.service';
import { convertFieldNodesToFieldPicker } from './utils/field-string-convertor';
import * as vm from 'vm';
import { findMainTableName } from './utils/find-table-name';
import e from 'express';

@Injectable()
export class GraphqlService {
  constructor(
    private dataSourceService: DataSourceService,
    private redisLockService: RedisLockService,
    private jwtService: JwtService,
    private tableHandlerService: TableHandlerService,
    private queryBuilderService: QueryBuilderService,
  ) {}

  private yogaApp: ReturnType<typeof createYoga>;

  private async pullMetadataFromDb(): Promise<any[]> {
    const dataSource = this.dataSourceService.getDataSource();
    const tableDefRepo = dataSource.getRepository('table_definition');
    const rootMeta = dataSource.getMetadata('table_definition');

    const qb = tableDefRepo.createQueryBuilder('table');
    qb.leftJoinAndSelect('table.columns', 'columns');
    qb.leftJoinAndSelect('table.relations', 'relations');
    qb.leftJoinAndSelect('relations.targetTable', 'targetTable');

    const aliasMap = new Map<string, string>();
    const visited = new Set<number>();

    function walk(meta: EntityMetadata, path: string[], alias: string) {
      const tableId = meta.tableName;
      if (visited.has(tableId as any)) return;

      visited.add(tableId as any);

      for (const rel of meta.relations) {
        const relPath = [...path, rel.propertyName];
        const aliasKey = ['table', ...relPath].join('_');
        const joinPath = `${alias}.${rel.propertyName}`;

        if (!aliasMap.has(aliasKey)) {
          aliasMap.set(aliasKey, aliasKey);
          qb.leftJoinAndSelect(joinPath, aliasKey);
          walk(rel.inverseEntityMetadata, relPath, aliasKey);
        }
      }

      visited.delete(tableId as any);
    }

    walk(rootMeta, [], 'table');

    return await qb.getMany();
  }

  private async schemaGenerator(): Promise<GraphQLSchema> {
    const tables = await this.pullMetadataFromDb();
    const metadatas = this.dataSourceService.getDataSource().entityMetadatas;
    const typeDefs = generateTypeDefsFromTables(tables, metadatas);

    const resolvers = {
      DynamicType: {
        __resolveType(obj) {
          return obj.__typename;
        },
      },
      Query: {
        dynamicResolver: async (
          _parent: any,
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
        ) => {
          const { mainTable, targetTables, user, handler } =
            await this.middlewareForDynamicResolver(context, info);

          const selections =
            info.fieldNodes?.[0]?.selectionSet?.selections || [];
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
                queryBuilderService: this.queryBuilderService,
                ...(args.meta && { meta: args.meta }),
                ...(args.sort && { sort: args.sort }),
                ...(args.aggregate && { aggregate: args.aggregate }),
              });

              await dynamicRepo.init();

              const name =
                table.name === mainTable.name
                  ? 'main'
                  : (table.alias ?? table.name);

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
        },
      },
    };

    return makeExecutableSchema({
      typeDefs,
      resolvers,
    });
  }

  private async middlewareForDynamicResolver(context: any, info: any) {
    const selections = info.fieldNodes[0]?.selectionSet?.selections || [];
    const mainTableName = findMainTableName(selections);

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

  async reloadSchema() {
    const schema = await this.schemaGenerator();

    this.yogaApp = createYoga({
      schema,
      graphqlEndpoint: '/graphql',
      graphiql: true,
    });
  }

  getYogaInstance() {
    return this.yogaApp;
  }

  canPass(currentRoute: any, user: any) {
    const isPublished = currentRoute.publishedMethods?.includes('GQL_QUERY');
    if (!isPublished) {
      throwGqlError('404', 'NotFound');
    }
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
  }
}
