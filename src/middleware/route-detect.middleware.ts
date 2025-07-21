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
import { RedisLockService } from '../redis/redis-lock.service';
import { QueryEngine } from '../query-engine/query-engine.service';
import { RouteCacheService } from '../redis/route-cache.service';
import { SystemProtectionService } from '../dynamic-repo/system-protection.service';
import { BcryptService } from '../auth/bcrypt.service';

@Injectable()
export class RouteDetectMiddleware implements NestMiddleware {
  constructor(
    private commonService: CommonService,
    private dataSourceService: DataSourceService,
    private jwtService: JwtService,
    private queryEngine: QueryEngine,
    private tableHandlerService: TableHandlerService,
    private redisLockService: RedisLockService,
    private routeCacheService: RouteCacheService,
    private systemProtectionService: SystemProtectionService,
    private bcryptService: BcryptService,
  ) {}

  async use(req: any, res: any, next: (error?: any) => void) {
    const method = req.method;
    let routes: any[] =
      (await this.redisLockService.get(GLOBAL_ROUTES_KEY)) ||
      (await this.routeCacheService.loadAndCacheRoutes());
    const matchedRoute = this.findMatchedRoute(routes, req.baseUrl, method);
    const systemTables = [
      'table_definition',
      'column_definition',
      'relation_definition',
    ];

    if (matchedRoute) {
      const dynamicFindEntries = await Promise.all(
        [
          matchedRoute.route.mainTable,
          ...matchedRoute.route.targetTables?.filter(
            (route) => !systemTables.includes(route.name),
          ),
        ]?.map(async (table) => {
          const dynamicRepo = new DynamicRepoService({
            query: req.query,
            tableName: table.name,
            tableHandlerService: this.tableHandlerService,
            dataSourceService: this.dataSourceService,
            queryEngine: this.queryEngine,
            routeCacheService: this.routeCacheService,
            systemProtectionService: this.systemProtectionService,
            currentUser: null,
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
          $jwt: (payload: any, exp: string) =>
            this.jwtService.sign(payload, { expiresIn: exp }),
          $bcrypt: {
            hash: async (plain: string) => await this.bcryptService.hash(plain),
            compare: async (p: string, h: string) =>
              await this.bcryptService.compare(p, h),
          },
        },
        $params: matchedRoute.params ?? {},
        $query: req.query ?? {},
        $user: req.user ?? undefined,
        $repos: dynamicFindMap,
        $req: req,
        $share: {
          $logs: [],
        },
      };
      context.$logs = (...args: any[]) => {
        context.$share.$logs.push(...args);
      };
      const { route, params } = matchedRoute;

      const filteredHooks = route.hooks.filter((hook: any) => {
        const isGlobalAll = !hook.route && !hook.method;
        const isGlobalMethod = !hook.route && hook.method?.method === method;
        const isLocalAll = hook.route?.id === route.id && !hook.method;
        const isLocalMethod =
          hook.route?.id === route.id && hook.method?.method === method;

        return isGlobalAll || isGlobalMethod || isLocalAll || isLocalMethod;
      });

      req.routeData = {
        ...route,
        handler:
          route.handlers.find((handler) => handler.method?.method === method)
            ?.logic ?? null,
        params,
        hooks: filteredHooks,
        isPublished:
          route.publishedMethods?.some(
            (pubMethod: any) => pubMethod.method === req.method,
          ) || false,
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
      const paths = [route.path, ...matchers.map((fn) => fn(route))].map(
        (p) => '/' + p.replace(/^\/+/, ''),
      );

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
