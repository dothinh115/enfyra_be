import { Injectable, NestMiddleware } from '@nestjs/common';
import { CommonService } from '../common/services/common.service';
import { DataSourceService } from '../../core/database/data-source/data-source.service';
import { JwtService } from '@nestjs/jwt';
import { TableHandlerService } from '../../modules/table-management/services/table-handler.service';
import { DynamicRepository } from '../../modules/dynamic-api/repositories/dynamic.repository';
import { TDynamicContext } from '../utils/types/dynamic-context.type';
import { QueryEngine } from '../../infrastructure/query-engine/services/query-engine.service';
import { RouteCacheService } from '../../infrastructure/redis/services/route-cache.service';
import { SystemProtectionService } from '../../modules/dynamic-api/services/system-protection.service';
import { BcryptService } from '../../core/auth/services/bcrypt.service';
import { ScriptErrorFactory } from '../../shared/utils/script-error-factory';
import { FolderManagementService } from '../../modules/folder-management/services/folder-management.service';
import { FileManagementService } from '../../modules/file-management/services/file-management.service';
import { autoSlug } from '../utils/auto-slug.helper';

@Injectable()
export class RouteDetectMiddleware implements NestMiddleware {
  constructor(
    private commonService: CommonService,
    private dataSourceService: DataSourceService,
    private jwtService: JwtService,
    private queryEngine: QueryEngine,
    private tableHandlerService: TableHandlerService,
    private routeCacheService: RouteCacheService,
    private systemProtectionService: SystemProtectionService,
    private bcryptService: BcryptService,
    private folderManagementService: FolderManagementService,
    private fileManagementService: FileManagementService,
  ) {}

  async use(req: any, res: any, next: (error?: any) => void) {
    const method = req.method;

    const routes: any[] = await this.routeCacheService.getRoutesWithSWR();

    const matchedRoute = this.findMatchedRoute(routes, req.baseUrl, method);
    const systemTables = [
      'table_definition',
      'column_definition',
      'relation_definition',
    ];

    if (matchedRoute) {
      // Create context first
      const context: TDynamicContext = {
        $body: req.body,
        $errors: ScriptErrorFactory.createErrorHandlers(),
        $logs(...args) {},
        $helpers: {
          $jwt: (payload: any, exp: string) =>
            this.jwtService.sign(payload, { expiresIn: exp }),
          $bcrypt: {
            hash: async (plain: string) => await this.bcryptService.hash(plain),
            compare: async (p: string, h: string) =>
              await this.bcryptService.compare(p, h),
          },
          autoSlug: autoSlug,
        },
        $params: matchedRoute.params ?? {},
        $query: req.query ?? {},
        $user: req.user ?? undefined,
        $repos: {}, // Will be populated after repos are created
        $req: req,
        $share: {
          $logs: [],
        },
      };
      context.$logs = (...args: any[]) => {
        context.$share.$logs.push(...args);
      };

      // Create dynamic repositories with context
      const dynamicFindEntries = await Promise.all(
        [
          matchedRoute.route.mainTable,
          ...matchedRoute.route.targetTables?.filter(
            (route) => !systemTables.includes(route.name),
          ),
        ]?.map(async (table) => {
          const dynamicRepo = new DynamicRepository({
            context: context,
            tableName: table.name,
            tableHandlerService: this.tableHandlerService,
            dataSourceService: this.dataSourceService,
            queryEngine: this.queryEngine,
            routeCacheService: this.routeCacheService,
            systemProtectionService: this.systemProtectionService,
            folderManagementService: this.folderManagementService,
            fileManagementService: this.fileManagementService,
          });

          await dynamicRepo.init();
          const name = table.alias ?? table.name;
          return [`${name}`, dynamicRepo];
        }),
      );

      // Create repos object and add main alias for mainTable
      context.$repos = Object.fromEntries(dynamicFindEntries);
      
      // Add 'main' alias for mainTable
      const mainTableName = matchedRoute.route.mainTable.alias ?? matchedRoute.route.mainTable.name;
      if (context.$repos[mainTableName]) {
        context.$repos.main = context.$repos[mainTableName];
      }
      const { route, params } = matchedRoute;

      const filteredHooks = route.hooks.filter((hook: any) => {
        const methodList = hook.methods?.map((m: any) => m.method) ?? [];

        const isGlobalAll = !hook.route && methodList.length === 0;
        const isGlobalMethod = !hook.route && methodList.includes(method);
        const isLocalAll =
          hook.route?.id === route.id && methodList.length === 0;
        const isLocalMethod =
          hook.route?.id === route.id && methodList.includes(method);

        return isGlobalAll || isGlobalMethod || isLocalAll || isLocalMethod;
      });

      req.routeData = {
        ...route,
        handler:
          route.handlers.find((handler) => handler.method?.method === method)
            ?.logic ?? null,
        params,
        hooks: filteredHooks,
        isPublished:
          route.publishedMethods?.some(
            (pubMethod: any) => pubMethod.method === req.method,
          ) || false,
        context,
      };
    }
    next();
  }

  private findMatchedRoute(routes: any[], reqPath: string, method: string) {
    const matchers = ['DELETE', 'PATCH'].includes(method)
      ? [(r) => r.path + '/:id', (r) => r.path]
      : [(r) => r.path];

    for (const route of routes) {
      const paths = [route.path, ...matchers.map((fn) => fn(route))].map(
        (p) => '/' + p.replace(/^\/+/, ''),
      );

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
