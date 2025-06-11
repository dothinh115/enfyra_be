import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

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
  constructor(private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic || req.routeData.isPublished) return true;
    if (!req.user) throw new UnauthorizedException();
    if (req.user.isRootAdmin) return true;
    const canAccess = req.routeData.permissions.find((permission) => {
      return (
        permission.role.id === req.user.role.id &&
        permission.actions.includes(permissionMap[req.method])
      );
    });
    return canAccess;
  }
}
