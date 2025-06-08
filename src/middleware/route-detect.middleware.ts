import {
  Inject,
  Injectable,
  NestMiddleware,
  NotFoundException,
} from '@nestjs/common';
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
        .where('route.isEnabled = :enabled', {
          enabled: true,
        })
        .getMany();
      await this.cache.set(GLOBAL_ROUTES_KEY, routes, 5);
    }

    const matchedRoute = routes.find((route) => {
      const matched = this.commonService.isRouteMatched({
        routePath: route.path,
        reqPath: req.originalUrl,
        prefix: 'api',
      });
      if (matched) {
        req.routeData = {
          ...matched,
          ...route,
        };
        return true;
      }
      return false;
    });
    if (!matchedRoute) throw new NotFoundException();

    next();
  }
}
