import { BadRequestException } from '@nestjs/common';
import { DataSourceService } from '../data-source/data-source.service';
import { Repository } from 'typeorm';
import { TableHandlerService } from '../table/table.service';
import { QueryEngine } from '../query-builder/query-engine.service';
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
    try {
      if (this.tableName === 'table_definition') {
        body.isSystem = false;
        const table: any = await this.tableHandlerService.createTable(body);
        return await this.find({
          where: {
            id: {
              _eq: table.id,
            },
          },
        });
      }
      const created: any = await this.repo.save(body);

      const result = await this.find({
        where: {
          id: {
            _eq: created.id,
          },
        },
      });

      await this.reload();
      return result;
    } catch (error) {
      console.log('❌ Lỗi trong dynamic repo:', error);
      throw new BadRequestException(error.message);
    }
  }

  async update(id: string | number, body: any) {
    try {
      const exists = await this.repo.findOne({
        where: {
          id,
        },
      });

      if (!exists) throw new BadRequestException(`id ${id} is not exists!`);
      this.protectSystemRecord(exists);
      if (this.tableName === 'table_definition') {
        const table: any = await this.tableHandlerService.updateTable(
          +id,
          body,
        );
        return this.find({
          where: {
            id: {
              _eq: table.id,
            },
          },
        });
      }
      await this.repo.save({
        ...exists,
        ...body,
      });

      const result = await this.find({
        where: {
          id: {
            _eq: exists.id,
          },
        },
      });

      await this.reload();
      return result;
    } catch (error) {
      console.log('❌ Lỗi trong dynamic repo:', error);
      throw new BadRequestException(error.message);
    }
  }

  async delete(id: string | number) {
    try {
      if (this.tableName === 'table_definition') {
        await this.tableHandlerService.delete(+id);

        return 'Success';
      }
      const exists = await this.repo.findOne({
        where: {
          id,
        },
      });
      if (!exists) throw new BadRequestException(`id ${id} is not exists!`);
      this.protectSystemRecord(exists);
      const repo = this.dataSourceService.getRepository(this.tableName);

      await repo.delete(id);
      await this.reload();
      return `Delete successfully!`;
    } catch (error) {
      console.log('❌ Lỗi trong dynamic repo:', error);
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
      ].includes(this.tableName)
    ) {
      await this.routeCacheService.reloadRouteCache();
    }
  }

  private protectSystemRecord(record: any) {
    if (
      this.tableName === 'route_definition' &&
      record.isSystem &&
      record.isEnabled === false
    ) {
      throw new Error(`Cannot disable system route`);
    }
  }
}
