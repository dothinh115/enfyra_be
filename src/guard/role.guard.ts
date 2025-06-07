import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Route_definition } from '../entities/route_definition.entity';
import { Repository } from 'typeorm';
import { CommonService } from '../common/common.service';

@Injectable()
export class RoleGuard implements CanActivate {
  constructor(
    @InjectRepository(Route_definition)
    private routeDefRepo: Repository<Route_definition>,
    private commonService: CommonService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const method = req.method;

    const routes = await this.routeDefRepo.find({
      where: {
        isEnabled: true,
        method,
      },
      relations: ['roles'],
    });

    const matchedRoute = routes.find((route) =>
      this.commonService.isRouteMatched({
        routePath: route.path,
        reqPath: req.path,
        prefix: 'api',
      }),
    );

    if (!matchedRoute) return false;

    if (matchedRoute.isPublished) return true;

    if (!req.user) throw new UnauthorizedException();
    if (req.user.isRootAdmin) return true;

    const canPassed = matchedRoute.roles.some((routeRole) =>
      req.user.roles.some((userRole) => routeRole.id === userRole.id),
    );

    return canPassed;
  }
}
