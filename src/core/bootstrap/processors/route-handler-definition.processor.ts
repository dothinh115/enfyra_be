import { Injectable } from '@nestjs/common';
import { BaseTableProcessor } from './base-table-processor';
import { DataSourceService } from '../../../core/database/data-source/data-source.service';

@Injectable()
export class RouteHandlerDefinitionProcessor extends BaseTableProcessor {
  constructor(private readonly dataSourceService: DataSourceService) {
    super();
  }

  async transformRecords(records: any[]): Promise<any[]> {
    if (!records || records.length === 0) {
      return [];
    }

    const methodRepo =
      this.dataSourceService.getRepository('method_definition');
    const routeRepo = this.dataSourceService.getRepository('route_definition');

    // Batch fetch all unique methods and routes to reduce database queries
    const uniqueMethods = [
      ...new Set(records.map(r => r.method).filter(Boolean)),
    ];
    const uniqueRoutes = [
      ...new Set(records.map(r => r.route).filter(Boolean)),
    ];

    // Fetch all methods in one query
    const methods = await methodRepo.find({
      where: uniqueMethods.map(method => ({ method })),
    });
    const methodMap = new Map(methods.map((m: any) => [m.method, m]));

    // Fetch all routes in one query
    const routes = await routeRepo.find({
      where: uniqueRoutes.map(route => ({ path: route })),
    });
    const routeMap = new Map(routes.map((r: any) => [r.path, r]));

    // Transform records using cached data
    const transformedRecords = records.map(record => {
      const transformedRecord = { ...record };

      // Transform method string to method entity reference
      if (record.method && typeof record.method === 'string') {
        const method = methodMap.get(record.method);
        if (method) {
          transformedRecord.method = method;
          this.logger.debug(
            `🔗 Route handler method linked: ${record.method} -> ${(method as any).id}`
          );
        } else {
          this.logger.warn(
            `⚠️ Method '${record.method}' not found for route handler, skipping.`
          );
          return null;
        }
      }

      // Transform route string to route entity reference
      if (record.route && typeof record.route === 'string') {
        const route = routeMap.get(record.route);
        if (route) {
          transformedRecord.route = route;
          this.logger.debug(
            `🔗 Route handler route linked: ${record.route} -> ${(route as any).id}`
          );
        } else {
          this.logger.warn(
            `⚠️ Route '${record.route}' not found for route handler, skipping.`
          );
          return null;
        }
      }

      return transformedRecord;
    });

    // Filter out null records
    return transformedRecords.filter(Boolean);
  }

  getUniqueIdentifier(record: any): object {
    // Use method and route for unique identification
    const identifier: any = {};

    if (record.method) {
      if (typeof record.method === 'object' && record.method.id) {
        identifier.method = record.method;
      } else if (typeof record.method === 'string') {
        identifier.method = record.method;
      }
    }

    if (record.route) {
      if (typeof record.route === 'object' && record.route.id) {
        identifier.route = record.route;
      } else if (typeof record.route === 'string') {
        identifier.route = record.route;
      }
    }

    return identifier;
  }

  protected getCompareFields(): string[] {
    return ['description', 'logic'];
  }

  protected getRecordIdentifier(record: any): string {
    const methodName =
      typeof record.method === 'object' ? record.method.method : record.method;
    const routePath =
      typeof record.route === 'object' ? record.route.path : record.route;
    return `[RouteHandler] ${methodName} ${routePath}`;
  }
}
