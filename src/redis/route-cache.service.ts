import { Injectable, Logger } from '@nestjs/common';
import { DataSourceService } from '../data-source/data-source.service';
import { RedisLockService } from './redis-lock.service';
import { Repository, IsNull } from 'typeorm';
import { GLOBAL_ROUTES_KEY } from '../utils/constant';

const STALE_ROUTES_KEY = 'stale:routes';
const REVALIDATING_KEY = 'revalidating:routes';

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

    // Update both main cache and stale cache
    await Promise.all([
      this.redisLockService.acquire(GLOBAL_ROUTES_KEY, routes, 60000),
      this.redisLockService.set(STALE_ROUTES_KEY, routes, 0),
    ]);

    return routes;
  }

  async reloadRouteCache(): Promise<void> {
    try {
      const routes = await this.loadRoutes();

      await Promise.all([
        this.redisLockService.set(GLOBAL_ROUTES_KEY, routes, 60000),
        this.redisLockService.set(STALE_ROUTES_KEY, routes, 0),
      ]);

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

  async getRoutesWithSWR(): Promise<any[]> {
    // Try to get fresh routes from cache
    const cachedRoutes = await this.redisLockService.get(GLOBAL_ROUTES_KEY);

    if (cachedRoutes) {
      // Cache hit - just return, no need to update stale cache
      return cachedRoutes;
    }

    // Cache miss - check if we have stale data in Redis to return immediately
    const staleRoutes = await this.redisLockService.get(STALE_ROUTES_KEY);
    const isRevalidating = await this.redisLockService.get(REVALIDATING_KEY);

    if (staleRoutes && !isRevalidating) {
      // Start background revalidation (non-blocking)
      this.backgroundRevalidate();

      this.logger.debug(
        '[RouteCache] Cache expired, returning stale data while revalidating in background',
      );
      return staleRoutes;
    }

    // No stale data available or already revalidating - fetch synchronously
    this.logger.debug(
      '[RouteCache] No cached data available, fetching routes synchronously',
    );
    return await this.loadAndCacheRoutes();
  }

  private async backgroundRevalidate(): Promise<void> {
    // Set revalidating flag in Redis (multi-instance safe)
    const acquired = await this.redisLockService.acquire(
      REVALIDATING_KEY,
      'true',
      30000, // 30s TTL for revalidation lock
    );

    if (!acquired) {
      return; // Another instance is already revalidating
    }

    this.logger.debug('[RouteCache] Starting background revalidation');

    try {
      await this.reloadRouteCache();
      this.logger.debug('[RouteCache] Background revalidation completed');
    } catch (error) {
      this.logger.error('[RouteCache] Background revalidation failed:', error);
    } finally {
      // Clear revalidating flag
      await this.redisLockService.release(REVALIDATING_KEY, 'true');
    }
  }
}
