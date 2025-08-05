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
  private currentUser: any;
  private deep: any;

  constructor({
    query = {},
    tableName,
    queryEngine,
    dataSourceService,
    tableHandlerService,
    routeCacheService,
    systemProtectionService,
    currentUser,
  }: {
    query: Partial<{
      fields: string;
      filter: any;
      page: number;
      limit: number;
      meta: 'filterCount' | 'totalCount' | '*';
      aggregate: any;
      sort: string | string[];
      deep: any;
    }>;
    tableName: string;
    queryEngine: QueryEngine;
    dataSourceService: DataSourceService;
    tableHandlerService: TableHandlerService;
    routeCacheService: RouteCacheService;
    systemProtectionService: SystemProtectionService;
    currentUser: any;
  }) {
    this.fields = query.fields ?? '';
    this.filter = query.filter ?? {};
    this.page = query.page ?? 1;
    this.limit = query.limit ?? 10;
    this.meta = query.meta;
    this.sort = query.sort ?? 'id';
    this.aggregate = query.aggregate ?? {};
    this.deep = query.deep ?? {};
    this.tableName = tableName;
    this.queryEngine = queryEngine;
    this.dataSourceService = dataSourceService;
    this.tableHandlerService = tableHandlerService;
    this.routeCacheService = routeCacheService;
    this.systemProtectionService = systemProtectionService;
    this.currentUser = currentUser;
  }

  async init() {
    this.repo = this.dataSourceService.getRepository(this.tableName);
  }

  async find(opt: { where?: any }) {
    return await this.queryEngine.find({
      tableName: this.tableName,
      fields: this.fields,
      filter: opt?.where || this.filter,
      page: this.page,
      limit: this.limit,
      meta: this.meta,
      sort: this.sort,
      aggregate: this.aggregate,
      deep: this.deep,
    });
  }

  async create(body: any) {
    try {
      this.systemProtectionService.assertSystemSafe({
        operation: 'create',
        tableName: this.tableName,
        data: body,
        existing: null,
        currentUser: this.currentUser,
      });

      if (this.tableName === 'table_definition') {
        body.isSystem = false;
        const table: any = await this.tableHandlerService.createTable(body);
        await this.reload();
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

      this.systemProtectionService.assertSystemSafe({
        operation: 'update',
        tableName: this.tableName,
        data: body,
        existing: exists,
        currentUser: this.currentUser,
      });

      if (this.tableName === 'table_definition') {
        const table: any = await this.tableHandlerService.updateTable(
          +id,
          body,
        );
        return this.find({ where: { id: { _eq: table.id } } });
      }
      body.id = exists.id;
      await this.repo.save(body);
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

      this.systemProtectionService.assertSystemSafe({
        operation: 'delete',
        tableName: this.tableName,
        data: {},
        existing: exists,
        currentUser: this.currentUser,
      });

      if (this.tableName === 'table_definition') {
        await this.tableHandlerService.delete(+id);
        return { message: 'Success', statusCode: 200 };
      }

      await this.repo.delete(id);
      await this.reload();
      return { message: 'Delete successfully!', statusCode: 200 };
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
        'hook_definition',
        'route_handler_definition',
        'route_permission_definition',
        'role_definition',
      ].includes(this.tableName)
    ) {
      await this.routeCacheService.reloadRouteCache();
    }
  }
}
