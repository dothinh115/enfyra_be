import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY, GLOBAL_SETTINGS_KEY } from '../utils/constant';
import { DataSourceService } from '../data-source/data-source.service';
import { RedisLockService } from '../common/redis-lock.service';

@Injectable()
export class RoleGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private dataSourceService: DataSourceService,
    private redisLockService: RedisLockService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic || req.routeData?.isPublished) return true;

    if (!req.user) throw new UnauthorizedException();
    if (req.user.isRootAdmin) return true;

    let methodMap = await this.redisLockService.get(GLOBAL_SETTINGS_KEY);
    if (!methodMap) {
      methodMap = await this.getPermissionMap();
      await this.redisLockService.acquire(
        GLOBAL_SETTINGS_KEY,
        methodMap,
        60000,
      );
    }

    const action = methodMap[req.method];
    if (!action)
      throw new NotFoundException(`Không có quyền cho method ${req.method}`);

    const rolePermissions = req.user.role?.permissions || [];
    if (!rolePermissions.includes(action)) {
      throw new UnauthorizedException(`Bạn không có quyền '${action}'`);
    }

    return true;
  }

  async getPermissionMap() {
    const settingDefRepo =
      this.dataSourceService.getRepository('setting_definition');
    const settings: any = await settingDefRepo.findOneBy({});
    return settings?.actionPermissionValue || {};
  }
}
