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
    let routes: Route_definition[] = await this.cache.get(GLOBAL_ROUTES_KEY);
    if (!routes) {
      routes = await this.routeDefRepo
        .createQueryBuilder('route')
        .leftJoinAndSelect('route.middlewares', 'middlewares')
        .leftJoinAndSelect('route.mainTable', 'mainTable')
        .leftJoinAndSelect('route.targetTables', 'targetTables')
        .leftJoinAndSelect('route.hooks', 'hooks')
        .leftJoinAndSelect(
          'route.handlers',
          'handlers',
          'handlers.method = :method',
          { method: req.method },
        )
        .leftJoinAndSelect(
          'route.permissions',
          'permissions',
          'permissions.isEnabled = :enabled',
          { enabled: true },
        )
        .leftJoinAndSelect('permissions.role', 'role')
        .where('route.isEnabled = :enabled', {
          enabled: true,
        })
        .getMany();
      await this.cache.set(GLOBAL_ROUTES_KEY, routes, 5);
    }

    //match trực tiếp, vì có thể sẽ match custom path ví dụ /abc/:id/xyz/:postId
    let params: any;
    let routeData: any;
    const directMatched = routes.find((route) => {
      const matched = this.commonService.isRouteMatched({
        routePath: route.path,
        reqPath: req.originalUrl,
        prefix: 'api',
      });
      if (matched) {
        params = matched.params;
        return true;
      }
      return false;
    });
    if (directMatched) {
      routeData = {
        ...directMatched,
        handler: directMatched.handlers.length
          ? directMatched.handlers[0].logic
          : undefined,
        params,
      };
      delete routeData.handlers;
      req.routeData = routeData;
      return next();
    }

    //nếu ko match trực tiếp thì sẽ so sánh crud
    let matchedRoute = this.tryMatchRoute(routes, req.originalUrl, req.method);
    routeData = matchedRoute
      ? {
          ...matchedRoute.route,
          handler: matchedRoute.route.handlers.length
            ? matchedRoute.route.handlers[0].logic
            : undefined,
          params: matchedRoute.params,
        }
      : null;
    if (routeData) delete routeData.handlers;
    req.routeData = routeData;
    next();
  }

  private tryMatchRoute(
    routes: Route_definition[],
    reqPath: string,
    method: string,
  ) {
    const checkPaths = ['DELETE', 'PATCH', 'GET'].includes(method)
      ? [(r) => r.path + '/:id', (r) => r.path]
      : [(r) => r.path];

    for (const route of routes) {
      for (const buildPath of checkPaths) {
        const matched = this.commonService.isRouteMatched({
          routePath: buildPath(route),
          reqPath,
          prefix: 'api',
        });
        if (matched) return { route, params: matched.params };
      }
    }

    return null;
  }
}
