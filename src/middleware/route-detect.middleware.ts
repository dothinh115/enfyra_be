import {
  BadRequestException,
  Inject,
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import { Route_definition } from '../entities/route_definition.entity';
import { Repository } from 'typeorm';
import { CommonService } from '../common/common.service';
import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager';
import { GLOBAL_ROUTES_KEY } from '../utils/constant';
import { DataSourceService } from '../data-source/data-source.service';
import { JwtService } from '@nestjs/jwt';
import { TableHandlerService } from '../table/table.service';
import { DynamicRepoService } from '../dynamic-repo/dynamic-repo.service';
import { TDynamicContext } from '../utils/types/dynamic-context.type';
import { DynamicQueryService } from '../dynamic-find/dynamic-query.service';

@Injectable()
export class RouteDetectMiddleware implements NestMiddleware {
  constructor(
    private commonService: CommonService,
    @Inject(CACHE_MANAGER) private cache: Cache,
    private dataSourceService: DataSourceService,
    private jwtService: JwtService,
    private dynamicQueryService: DynamicQueryService,
    private tableHandlerService: TableHandlerService,
  ) {}

  async use(req: any, res: any, next: (error?: any) => void) {
    const method = req.method;
    let routes: Route_definition[] =
      (await this.cache.get(GLOBAL_ROUTES_KEY)) ||
      (await this.loadAndCacheRoutes(method));

    const matchedRoute = this.findMatchedRoute(routes, req.baseUrl, method);

    if (matchedRoute) {
      const dynamicFindEntries = await Promise.all(
        [matchedRoute.route.mainTable, ...matchedRoute.route.targetTables]?.map(
          async (table) => {
            const dynamicRepo = new DynamicRepoService({
              fields: req.query.fields as string,
              filter: req.query.filter,
              page: Number(req.query.page ?? 1),
              tableName: table.name,
              limit: Number(req.query.limit ?? 10),
              tableHandlerService: this.tableHandlerService,
              dataSourceService: this.dataSourceService,
              dynamicQueryService: this.dynamicQueryService,
              ...(req.query.meta && {
                meta: req.query.meta,
              }),
            });
            await dynamicRepo.init();
            const name =
              table.name === matchedRoute.route.mainTable.name
                ? 'main'
                : (table.alias ?? table.name);
            return [`${name}`, dynamicRepo];
          },
        ),
      );

      const dynamicFindMap: { any: any } =
        Object.fromEntries(dynamicFindEntries);

      const context: TDynamicContext = {
        $body: req.body,
        $errors: {
          throw400: (msg: string) => {
            throw new BadRequestException(msg);
          },
          throw401: () => {
            throw new UnauthorizedException();
          },
        },
        $logs(...args) {},
        $helpers: {
          jwt: (payload: any, ext: string) =>
            this.jwtService.sign(payload, { expiresIn: ext }),
        },
        $params: matchedRoute.params ?? {},
        $query: req.query ?? {},
        $user: req.user ?? undefined,
        $repos: dynamicFindMap,
        $req: req,
      };
      const { route, params } = matchedRoute;
      req.routeData = {
        ...route,
        handler: route.handlers.length ? route.handlers[0].logic : null,
        params,
        isPublished:
          matchedRoute.route.publishedMethods?.includes(req.method) || false,
        context,
      };
    }

    next();
  }

  private async loadAndCacheRoutes(method: string) {
    const routeDefRepo: Repository<Route_definition> =
      this.dataSourceService.getRepository('route_definition');

    const middlewareRepo = this.dataSourceService.getRepository(
      'middleware_definition',
    );

    // ✳️ Query middleware toàn cục
    const globalMiddlewares = await middlewareRepo.find({
      where: { isEnabled: true, route: null },
      order: { priority: 'ASC' },
    });

    // ✳️ Query route + middleware riêng
    const routes = await routeDefRepo
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
        'route.permissions',
        'permissions',
        'permissions.isEnabled = :enabled',
        {
          enabled: true,
        },
      )
      .leftJoinAndSelect('permissions.role', 'role')
      .where('route.isEnabled = :enabled', { enabled: true })
      .getMany();

    // ✳️ Merge middleware toàn cục vào từng route
    routes.forEach((route: any) => {
      route.hooks?.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
      route.middlewares = [
        ...globalMiddlewares,
        ...(route.middlewares ?? []),
      ].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
    });

    await this.cache.set(GLOBAL_ROUTES_KEY, routes, 5);
    return routes;
  }

  private findMatchedRoute(
    routes: Route_definition[],
    reqPath: string,
    method: string,
  ) {
    const matchers = ['DELETE', 'PATCH'].includes(method)
      ? [(r) => r.path + '/:id', (r) => r.path]
      : [(r) => r.path];

    for (const route of routes) {
      const paths = [route.path, ...matchers.map((fn) => fn(route))];
      for (const routePath of paths) {
        const matched = this.commonService.isRouteMatched({
          routePath,
          reqPath,
        });
        if (matched) return { route, params: matched.params };
      }
    }

    return null;
  }
}
