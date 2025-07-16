import { Injectable } from '@nestjs/common';
import { DataSourceService } from '../data-source/data-source.service';
import { RedisLockService } from './redis-lock.service';
import { IsNull, Repository } from 'typeorm';
import { GLOBAL_ROUTES_KEY } from '../utils/constant';

@Injectable()
export class RouteCacheService {
  constructor(
    private dataSourceService: DataSourceService,
    private redisLockService: RedisLockService,
  ) {}

  async loadAndCacheRoutes() {
    const routeDefRepo: Repository<any> =
      this.dataSourceService.getRepository('route_definition');

    const middlewareRepo = this.dataSourceService.getRepository(
      'middleware_definition',
    );
    const hookRepo = this.dataSourceService.getRepository('hook_definition');

    const [globalMiddlewares, globalHooks, routes] = await Promise.all([
      middlewareRepo.find({
        where: { isEnabled: true, route: null },
        order: { priority: 'ASC' },
      }),
      hookRepo.find({
        where: { isEnabled: true, route: IsNull() },
        order: { priority: 'ASC' },
        relations: ['method', 'route'],
      }),
      routeDefRepo
        .createQueryBuilder('route')
        .leftJoinAndSelect('route.mainTable', 'mainTable')
        .leftJoinAndSelect('route.targetTables', 'targetTables')
        .leftJoinAndSelect(
          'route.hooks',
          'hooks',
          'hooks.isEnabled = :enabled',
          {
            enabled: true,
          },
        )
        .leftJoinAndSelect('hooks.method', 'hooks_method')
        .leftJoinAndSelect('hooks.route', 'hooks_route')
        .leftJoinAndSelect('route.handlers', 'handlers')
        .leftJoinAndSelect('handlers.method', 'handlers_method')
        .leftJoinAndSelect(
          'route.routePermissions',
          'routePermissions',
          'routePermissions.isEnabled = :enabled',
          {
            enabled: true,
          },
        )
        .leftJoinAndSelect('routePermissions.role', 'role')
        .leftJoinAndSelect('routePermissions.methods', 'methods')
        .leftJoinAndSelect('route.publishedMethods', 'publishedMethods')
        .where('route.isEnabled = :enabled', { enabled: true })
        .getMany(),
    ]);

    routes.forEach((route: any) => {
      route.hooks?.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
      route.hooks = [...globalHooks, ...route.hooks];
    });

    await this.redisLockService.acquire(GLOBAL_ROUTES_KEY, routes, 15000);
    return routes;
  }

  async reloadRouteCache() {
    await this.redisLockService.deleteKey(GLOBAL_ROUTES_KEY);
    await this.loadAndCacheRoutes();
    console.log(`[RouteCache] Nội dung: reload route cache`);
  }
}
