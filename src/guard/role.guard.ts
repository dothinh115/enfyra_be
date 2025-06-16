import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Setting_definition } from '../entities/setting_definition.entity';
import { Repository } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { IS_PUBLIC_KEY, GLOBAL_SETTINGS_KEY } from '../utils/constant';

@Injectable()
export class RoleGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @InjectRepository(Setting_definition)
    private settingDefRepo: Repository<Setting_definition>,
    @Inject(CACHE_MANAGER) private cache: Cache,
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

    let methodMap =
      await this.cache.get<Record<string, string>>(GLOBAL_SETTINGS_KEY);
    if (!methodMap) {
      methodMap = await this.getPermissionMap();
      await this.cache.set(GLOBAL_SETTINGS_KEY, methodMap, 60);
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
    const settings = await this.settingDefRepo.findOneBy({});
    return settings?.actionPermissionValue || {};
  }
}
