import {
  BadRequestException,
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import { CommonService } from '../common/common.service';
import { GLOBAL_ROUTES_KEY } from '../utils/constant';
import { DataSourceService } from '../data-source/data-source.service';
import { JwtService } from '@nestjs/jwt';
import { TableHandlerService } from '../table/table.service';
import { DynamicRepoService } from '../dynamic-repo/dynamic-repo.service';
import { TDynamicContext } from '../utils/types/dynamic-context.type';
import { RedisLockService } from '../common/redis-lock.service';
import { loadAndCacheRoutes } from './utils/load-and-cache-routes';
import { QueryEngine } from '../query-builder/query-engine.service';

@Injectable()
export class RouteDetectMiddleware implements NestMiddleware {
  constructor(
    private commonService: CommonService,
    private dataSourceService: DataSourceService,
    private jwtService: JwtService,
    private queryEngine: QueryEngine,
    private tableHandlerService: TableHandlerService,
    private redisLockService: RedisLockService,
  ) {}

  async use(req: any, res: any, next: (error?: any) => void) {
    const method = req.method;
    let routes: any[] =
      (await this.redisLockService.get(GLOBAL_ROUTES_KEY)) ||
      (await loadAndCacheRoutes(
        method,
        this.dataSourceService,
        this.redisLockService,
      ));
    const matchedRoute = this.findMatchedRoute(routes, req.baseUrl, method);
    const systemTables = [
      'table_definition',
      'column_definition',
      'relation_definition',
    ];

    if (matchedRoute) {
      const dynamicFindEntries = await Promise.all(
        [matchedRoute.route.mainTable, ...matchedRoute.route.targetTables]
          ?.filter((route) => !systemTables.includes(route.mainTable.name))
          .map(async (table) => {
            const dynamicRepo = new DynamicRepoService({
              fields: req.query.fields as string,
              filter: req.query.filter,
              page: Number(req.query.page ?? 1),
              tableName: table.name,
              limit: Number(req.query.limit ?? 10),
              tableHandlerService: this.tableHandlerService,
              dataSourceService: this.dataSourceService,
              queryEngine: this.queryEngine,
              ...(req.query.meta && {
                meta: req.query.meta,
              }),
              ...(req.query.sort && {
                sort: req.query.sort,
              }),
              ...(req.query.aggregate && {
                aggregate: req.query.aggregate,
              }),
            });
            await dynamicRepo.init();
            const name =
              table.name === matchedRoute.route.mainTable.name
                ? 'main'
                : (table.alias ?? table.name);
            return [`${name}`, dynamicRepo];
          }),
      );

      const dynamicFindMap: { any: any } =
        Object.fromEntries(dynamicFindEntries);

      const context: TDynamicContext = {
        $body: req.body,
        $errors: {
          throw400: (msg: string) => {
            throw new BadRequestException(msg);
          },
          throw401: () => {
            throw new UnauthorizedException();
          },
        },
        $logs(...args) {},
        $helpers: {
          jwt: (payload: any, ext: string) =>
            this.jwtService.sign(payload, { expiresIn: ext }),
        },
        $params: matchedRoute.params ?? {},
        $query: req.query ?? {},
        $user: req.user ?? undefined,
        $repos: dynamicFindMap,
        $req: req,
      };
      const { route, params } = matchedRoute;
      req.routeData = {
        ...route,
        handler: route.handlers.length ? route.handlers[0].logic : null,
        params,
        isPublished:
          matchedRoute.route.publishedMethods?.includes(req.method) || false,
        context,
      };
    }

    next();
  }

  private findMatchedRoute(routes: any[], reqPath: string, method: string) {
    const matchers = ['DELETE', 'PATCH'].includes(method)
      ? [(r) => r.path + '/:id', (r) => r.path]
      : [(r) => r.path];

    for (const route of routes) {
      const paths = [route.path, ...matchers.map((fn) => fn(route))];
      for (const routePath of paths) {
        const matched = this.commonService.isRouteMatched({
          routePath,
          reqPath,
        });
        if (matched) return { route, params: matched.params };
      }
    }

    return null;
  }
}
