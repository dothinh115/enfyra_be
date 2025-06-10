import { Inject, Injectable, NestMiddleware } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Route_definition } from '../entities/route_definition.entity';
import { Repository } from 'typeorm';
import { CommonService } from '../common/common.service';
import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager';
import { GLOBAL_ROUTES_KEY } from '../utils/constant';

@Injectable()
export class RouteDetectMiddleware implements NestMiddleware {
  constructor(
    @InjectRepository(Route_definition)
    private routeDefRepo: Repository<Route_definition>,
    private commonService: CommonService,
    @Inject(CACHE_MANAGER) private cache: Cache,
  ) {}

  async use(req: any, res: any, next: (error?: any) => void) {
    const method = req.method;
    let routes: Route_definition[] =
      (await this.cache.get(GLOBAL_ROUTES_KEY)) ||
      (await this.loadAndCacheRoutes(method));

    const matchedRoute = this.findMatchedRoute(routes, req.originalUrl, method);

    if (matchedRoute) {
      const { route, params } = matchedRoute;
      req.routeData = {
        ...route,
        handler: route.handlers?.[0]?.logic,
        params,
      };
    }

    next();
  }

  private async loadAndCacheRoutes(method: string) {
    const routes = await this.routeDefRepo
      .createQueryBuilder('route')
      .leftJoinAndSelect('route.middlewares', 'middlewares')
      .leftJoinAndSelect('route.mainTable', 'mainTable')
      .leftJoinAndSelect('route.targetTables', 'targetTables')
      .leftJoinAndSelect('route.hooks', 'hooks')
      .leftJoinAndSelect(
        'route.handlers',
        'handlers',
        'handlers.method = :method',
        { method },
      )
      .leftJoinAndSelect(
        'route.permissions',
        'permissions',
        'permissions.isEnabled = :enabled',
        { enabled: true },
      )
      .leftJoinAndSelect('permissions.role', 'role')
      .where('route.isEnabled = :enabled', { enabled: true })
      .getMany();

    await this.cache.set(GLOBAL_ROUTES_KEY, routes, 5);
    return routes;
  }

  private findMatchedRoute(
    routes: Route_definition[],
    reqPath: string,
    method: string,
  ) {
    const matchers = ['DELETE', 'PATCH'].includes(method)
      ? [(r) => r.path + '/:id', (r) => r.path]
      : [(r) => r.path];

    for (const route of routes) {
      const paths = [route.path, ...matchers.map((fn) => fn(route))];
      for (const routePath of paths) {
        const matched = this.commonService.isRouteMatched({
          routePath,
          reqPath,
          prefix: 'api',
        });
        if (matched) return { route, params: matched.params };
      }
    }

    return null;
  }
}
