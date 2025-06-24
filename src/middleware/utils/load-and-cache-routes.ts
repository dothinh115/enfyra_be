import { Repository } from 'typeorm';
import { GLOBAL_ROUTES_KEY } from '../../utils/constant';
import { DataSourceService } from '../../data-source/data-source.service';
import { RedisLockService } from '../../common/redis-lock.service';

export async function loadAndCacheRoutes(
  method: string,
  dataSourceService: DataSourceService,
  redisLockService: RedisLockService,
) {
  const routeDefRepo: Repository<any> =
    dataSourceService.getRepository('route_definition');

  const middlewareRepo = dataSourceService.getRepository(
    'middleware_definition',
  );
  const hookRepo = dataSourceService.getRepository('hook_definition');

  const [globalMiddlewares, globalHooks, routes] = await Promise.all([
    middlewareRepo.find({
      where: { isEnabled: true, route: null },
      order: { priority: 'ASC' },
    }),
    hookRepo.find({
      where: { isEnabled: true, route: null },
      order: { priority: 'ASC' },
    }),
    routeDefRepo
      .createQueryBuilder('route')
      .leftJoinAndSelect(
        'route.middlewares',
        'middlewares',
        'middlewares.isEnabled = :enabled',
        { enabled: true },
      )
      .leftJoinAndSelect('route.mainTable', 'mainTable')
      .leftJoinAndSelect('route.targetTables', 'targetTables')
      .leftJoinAndSelect('route.hooks', 'hooks', 'hooks.isEnabled = :enabled', {
        enabled: true,
      })
      .leftJoinAndSelect(
        'route.handlers',
        'handlers',
        'handlers.method = :method',
        {
          method,
        },
      )
      .leftJoinAndSelect(
        'route.routePermissions',
        'routePermissions',
        'routePermissions.isEnabled = :enabled',
        {
          enabled: true,
        },
      )
      .leftJoinAndSelect('routePermissions.role', 'role')
      .where('route.isEnabled = :enabled', { enabled: true })
      .getMany(),
  ]);

  routes.forEach((route: any) => {
    route.hooks?.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
    route.middlewares?.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
    route.hooks = [...globalHooks, ...route.hooks];
    route.middlewares = [...globalMiddlewares, ...route.middlewares];
  });

  await redisLockService.acquire(GLOBAL_ROUTES_KEY, routes, 5000);
  return routes;
}
