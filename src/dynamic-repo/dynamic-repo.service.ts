import { BadRequestException } from '@nestjs/common';
import { DataSourceService } from '../data-source/data-source.service';
import { Repository } from 'typeorm';
import { TableHandlerService } from '../table/table.service';
import { QueryEngine } from '../query-builder/query-engine.service';

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
  }

  async init() {
    this.repo = this.dataSourceService.getRepository(this.tableName);
  }

  async find(id?: string | number) {
    const result = await this.queryEngine.find({
      fields: this.fields,
      filter: id ? { ...this.filter, id: { _eq: id } } : this.filter,
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
      return await this.find(table.id);
    }
    const result: any = await this.repo.save(body);
    return await this.find(result.id);
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

    return await this.find(id);
  }

  async delete(id: string | number) {
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
    const repo = this.dataSourceService.getRepository(this.tableName);
    await repo.delete(id);
    return `Delete successfully!`;
  }
}
