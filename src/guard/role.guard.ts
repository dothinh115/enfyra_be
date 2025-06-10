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
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../utils/constant';

const permissionMap = {
  GET: 'read',
  POST: 'create',
  PATCH: 'update',
  DELETE: 'delete',
};

@Injectable()
export class RoleGuard implements CanActivate {
  constructor(
    @InjectRepository(Route_definition)
    private routeDefRepo: Repository<Route_definition>,
    private commonService: CommonService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    if (!req.user) throw new UnauthorizedException();
    if (req.user.isRootAdmin) return true;
    const canAccess = req.routeData.permissions.find((permission) => {
      return (
        permission.role.id === req.user.role.id &&
        permission.actions.includes(permissionMap[req.method])
      );
    });
    if (canAccess) return true;
    return false;
  }
}
