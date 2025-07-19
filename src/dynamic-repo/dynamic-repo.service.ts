import { BadRequestException } from '@nestjs/common';
import { DataSourceService } from '../data-source/data-source.service';
import { Repository } from 'typeorm';
import { TableHandlerService } from '../table/table.service';
import { QueryEngine } from '../query-engine/query-engine.service';
import { RouteCacheService } from '../redis/route-cache.service';
import { SystemProtectionService } from './system-protection.service';

export class DynamicRepoService {
  private fields: string;
  private filter: any;
  private page: number;
  private limit: number;
  private meta: 'filterCount' | 'totalCount' | '*';
  private aggregate: any;
  private sort: string | string[];
  private tableName: string;
  private queryEngine: QueryEngine;
  private dataSourceService: DataSourceService;
  private repo: Repository<any>;
  private tableHandlerService: TableHandlerService;
  private routeCacheService: RouteCacheService;
  private systemProtectionService: SystemProtectionService;

  constructor({
    fields = '',
    filter = {},
    page = 1,
    limit = 10,
    tableName,
    queryEngine,
    dataSourceService,
    tableHandlerService,
    meta,
    sort,
    aggregate = {},
    routeCacheService,
    systemProtectionService,
  }: {
    fields: string;
    filter: any;
    page: number;
    limit: number;
    tableName: string;
    queryEngine: QueryEngine;
    dataSourceService: DataSourceService;
    tableHandlerService: TableHandlerService;
    meta?: 'filterCount' | 'totalCount' | '*' | undefined;
    sort?: string | string[];
    aggregate: any;
    routeCacheService: RouteCacheService;
    systemProtectionService: SystemProtectionService;
  }) {
    this.fields = fields;
    this.filter = filter;
    this.page = page;
    this.limit = limit;
    this.tableName = tableName;
    this.queryEngine = queryEngine;
    this.dataSourceService = dataSourceService;
    this.tableHandlerService = tableHandlerService;
    this.meta = meta;
    this.sort = sort;
    this.aggregate = aggregate;
    this.routeCacheService = routeCacheService;
    this.systemProtectionService = systemProtectionService;
  }

  async init() {
    this.repo = this.dataSourceService.getRepository(this.tableName);
  }

  private async getRelatedRoute(data: any, existing: any) {
    if (
      [
        'route_handler_definition',
        'hook_definition',
        'middleware_definition',
      ].includes(this.tableName)
    ) {
      const routeId =
        data?.route?.id ||
        data?.routeId ||
        existing?.route?.id ||
        existing?.routeId;
      if (routeId) {
        return await this.dataSourceService
          .getRepository('route_definition')
          .findOne({ where: { id: routeId } });
      }
    }
    return null;
  }

  async find(opt: { where?: any }) {
    return await this.queryEngine.find({
      fields: this.fields,
      filter: opt?.where || this.filter,
      page: this.page,
      limit: this.limit,
      tableName: this.tableName,
      meta: this.meta,
      sort: this.sort,
      aggregate: this.aggregate,
    });
  }

  async create(body: any) {
    try {
      const relatedRoute = await this.getRelatedRoute(body, null);

      this.systemProtectionService.assertSystemSafe({
        operation: 'create',
        tableName: this.tableName,
        data: body,
        existing: null,
        relatedRoute,
      });

      if (this.tableName === 'table_definition') {
        body.isSystem = false;
        const table: any = await this.tableHandlerService.createTable(body);
        return await this.find({ where: { id: { _eq: table.id } } });
      }

      const created: any = await this.repo.save(body);
      const result = await this.find({ where: { id: { _eq: created.id } } });
      await this.reload();
      return result;
    } catch (error) {
      console.error('❌ Error in dynamic repo [create]:', error);
      throw new BadRequestException(error.message);
    }
  }

  async update(id: string | number, body: any) {
    try {
      const exists = await this.repo.findOne({ where: { id } });
      if (!exists) throw new BadRequestException(`id ${id} is not exists!`);

      const relatedRoute = await this.getRelatedRoute(body, exists);

      this.systemProtectionService.assertSystemSafe({
        operation: 'update',
        tableName: this.tableName,
        data: body,
        existing: exists,
        relatedRoute,
      });

      if (this.tableName === 'table_definition') {
        const table: any = await this.tableHandlerService.updateTable(
          +id,
          body,
        );
        return this.find({ where: { id: { _eq: table.id } } });
      }

      await this.repo.save({ ...exists, ...body });
      const result = await this.find({ where: { id: { _eq: id } } });
      await this.reload();
      return result;
    } catch (error) {
      console.error('❌ Error in dynamic repo [update]:', error);
      throw new BadRequestException(error.message);
    }
  }

  async delete(id: string | number) {
    try {
      const exists = await this.repo.findOne({ where: { id } });
      if (!exists) throw new BadRequestException(`id ${id} is not exists!`);

      const relatedRoute = await this.getRelatedRoute(null, exists);

      this.systemProtectionService.assertSystemSafe({
        operation: 'delete',
        tableName: this.tableName,
        data: {},
        existing: exists,
        relatedRoute,
      });

      if (this.tableName === 'table_definition') {
        await this.tableHandlerService.delete(+id);
        return 'Success';
      }

      await this.repo.delete(id);
      await this.reload();
      return `Delete successfully!`;
    } catch (error) {
      console.error('❌ Error in dynamic repo [delete]:', error);
      throw new BadRequestException(error.message);
    }
  }

  private async reload() {
    if (
      [
        'table_definition',
        'route_definition',
        'middleware_definition',
        'hook_definition',
        'route_handler_definition',
      ].includes(this.tableName)
    ) {
      await this.routeCacheService.reloadRouteCache();
    }
  }
}
