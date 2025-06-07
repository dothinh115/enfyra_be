import { Injectable, NestMiddleware, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Route_definition } from '../entities/route_definition.entity';
import { Repository } from 'typeorm';
import { CommonService } from '../common/common.service';

@Injectable()
export class RouteDetectMiddleware implements NestMiddleware {
  constructor(
    @InjectRepository(Route_definition)
    private routeDefRepo: Repository<Route_definition>,
    private commonService: CommonService,
  ) {}
  async use(req: any, res: any, next: (error?: any) => void) {
    console.log(req.query.fields);
    const routes = await this.routeDefRepo
      .createQueryBuilder('route')
      .leftJoinAndSelect('route.middlewares', 'middlewares')
      .where('route.isEnabled = :enabled', { enabled: true })
      .getMany();

    const matchedRoute = routes.find((route) => {
      const matched = this.commonService.isRouteMatched({
        routePath: route.path,
        reqPath: req.path,
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
