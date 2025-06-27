import { BadRequestException } from '@nestjs/common';
import { DataSourceService } from '../data-source/data-source.service';
import { Repository } from 'typeorm';
import { TableHandlerService } from '../table/table.service';
import { QueryEngine } from '../query-builder/query-engine.service';
import { RedisLockService } from '../redis/redis-lock.service';
import { GLOBAL_ROUTES_KEY } from '../utils/constant';
import { RouteCacheService } from '../redis/route-cache.service';

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
  }

  async init() {
    this.repo = this.dataSourceService.getRepository(this.tableName);
  }

  async find(opt: { where?: any }) {
    const result = await this.queryEngine.find({
      fields: this.fields,
      filter: opt?.where || this.filter,
      page: this.page,
      limit: this.limit,
      tableName: this.tableName,
      meta: this.meta,
      sort: this.sort,
      aggregate: this.aggregate,
    });
    return result;
  }

  async create(body: any) {
    if (this.tableName === 'table_definition') {
      const table: any = await this.tableHandlerService.createTable(body);
      await this.routeCacheService.reloadRouteCache();

      return await this.find(table.id);
    }
    const created: any = await this.repo.save(body);

    const result = await this.find({
      where: {
        id: {
          _eq: created.id,
        },
      },
    });
    if (this.tableName === 'route_definition') {
      await this.routeCacheService.reloadRouteCache();
    }
    return result;
  }

  async update(id: string | number, body: any) {
    const exists = await this.repo.findOne({
      where: {
        id,
      },
    });
    if (this.tableName === 'table_definition') {
      const table: any = await this.tableHandlerService.updateTable(+id, body);
      return this.find(table.id);
    }
    if (!exists) throw new BadRequestException(`id ${id} is not exists!`);
    await this.repo.save(body);

    const result = await this.find({
      where: {
        id: {
          _eq: exists.id,
        },
      },
    });
    if (this.tableName === 'route_definition') {
      await this.routeCacheService.reloadRouteCache();
    }
    return result;
  }

  async delete(id: string | number) {
    if (this.tableName === 'table_definition') {
      await this.tableHandlerService.delete(+id);
      await this.routeCacheService.reloadRouteCache();
      return 'Success';
    }
    const exists = await this.repo.findOne({
      where: {
        id,
      },
    });
    if (!exists) throw new BadRequestException(`id ${id} is not exists!`);
    const repo = this.dataSourceService.getRepository(this.tableName);

    await repo.delete(id);
    if (this.tableName === 'route_definition') {
      await this.routeCacheService.reloadRouteCache();
    }
    return `Delete successfully!`;
  }
}
