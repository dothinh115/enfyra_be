import { Injectable, Logger } from '@nestjs/common';
import { DataSourceService } from '../data-source/data-source.service';
import { RedisLockService } from './redis-lock.service';
import { Repository, IsNull } from 'typeorm';
import { GLOBAL_ROUTES_KEY } from '../utils/constant';

@Injectable()
export class RouteCacheService {
  private readonly logger = new Logger(RouteCacheService.name);

  constructor(
    private readonly dataSourceService: DataSourceService,
    private readonly redisLockService: RedisLockService,
  ) {}

  private async loadRoutes(): Promise<any[]> {
    const routeDefRepo: Repository<any> =
      this.dataSourceService.getRepository('route_definition');
    const hookRepo: Repository<any> =
      this.dataSourceService.getRepository('hook_definition');

    const [globalHooks, routes] = await Promise.all([
      hookRepo.find({
        where: { isEnabled: true, route: IsNull() },
        order: { priority: 'ASC' },
        relations: ['methods', 'route'],
      }),
      routeDefRepo
        .createQueryBuilder('route')
        .leftJoinAndSelect('route.mainTable', 'mainTable')
        .leftJoinAndSelect('route.targetTables', 'targetTables')
        .leftJoinAndSelect(
          'route.hooks',
          'hooks',
          'hooks.isEnabled = :enabled',
          { enabled: true },
        )
        .leftJoinAndSelect('hooks.methods', 'hooks_method')
        .leftJoinAndSelect('hooks.route', 'hooks_route')
        .leftJoinAndSelect('route.handlers', 'handlers')
        .leftJoinAndSelect('handlers.method', 'handlers_method')
        .leftJoinAndSelect(
          'route.routePermissions',
          'routePermissions',
          'routePermissions.isEnabled = :enabled',
          { enabled: true },
        )
        .leftJoinAndSelect('routePermissions.role', 'role')
        .leftJoinAndSelect('routePermissions.methods', 'methods')
        .leftJoinAndSelect('route.publishedMethods', 'publishedMethods')
        .where('route.isEnabled = :enabled', { enabled: true })
        .getMany(),
    ]);

    // Merge global hooks into each route
    for (const route of routes) {
      route.hooks = [
        ...(globalHooks || []),
        ...(route.hooks ?? []).sort(
          (a, b) => (a.priority ?? 0) - (b.priority ?? 0),
        ),
      ];
    }

    return routes;
  }

  async loadAndCacheRoutes(): Promise<any[]> {
    const routes = await this.loadRoutes();
    await this.redisLockService.acquire(GLOBAL_ROUTES_KEY, routes, 60000);
    return routes;
  }

  async reloadRouteCache(): Promise<void> {
    try {
      const routes = await this.loadRoutes();

      await this.redisLockService.set(GLOBAL_ROUTES_KEY, routes, 60000);

      this.logger.log(
        `[RouteCache] Reloaded route cache with ${routes.length} routes`,
      );
    } catch (error) {
      this.logger.error(
        '[RouteCache] Failed to reload route cache',
        error.stack || error.message,
      );
    }
  }
}
