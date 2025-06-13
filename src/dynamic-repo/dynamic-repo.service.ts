import { BadRequestException } from '@nestjs/common';
import { DataSourceService } from '../data-source/data-source.service';
import { Repository } from 'typeorm';
import { validateDto } from '../utils/helpers';
import { TableHandlerService } from '../table/table.service';
import { CreateTableDto } from '../table/dto/create-table.dto';
import { DynamicQueryService } from '../dynamic-query/dynamic-query.service';

export class DynamicRepoService {
  private fields: string;
  private filter: any;
  private page: number;
  private limit: number;
  private meta: 'filterCount' | 'totalCount' | '*';
  private tableName: string;
  private dynamicQueryService: DynamicQueryService;
  private dataSourceService: DataSourceService;
  private repo: Repository<any>;
  private tableHandlerService: TableHandlerService;
  constructor({
    fields = '',
    filter = {},
    page = 1,
    limit = 10,
    tableName,
    dynamicQueryService,
    dataSourceService,
    tableHandlerService,
    meta,
  }: {
    fields: string;
    filter: any;
    page: number;
    limit: number;
    tableName: string;
    dynamicQueryService: DynamicQueryService;
    dataSourceService: DataSourceService;
    tableHandlerService: TableHandlerService;
    meta?: 'filterCount' | 'totalCount' | '*' | undefined;
  }) {
    this.fields = fields;
    this.filter = filter;
    this.page = page;
    this.limit = limit;
    this.tableName = tableName;
    this.dynamicQueryService = dynamicQueryService;
    this.dataSourceService = dataSourceService;
    this.tableHandlerService = tableHandlerService;
    this.meta = meta;
  }

  async init() {
    this.repo = await this.dataSourceService.getRepository(this.tableName);
  }

  async find(id?: string | number) {
    return await this.dynamicQueryService.dynamicFind({
      fields: this.fields,
      filter: id ? { ...this.filter, id: { _eq: id } } : this.filter,
      page: this.page,
      limit: this.limit,
      tableName: this.tableName,
      meta: this.meta,
    });
  }

  async create(body: any) {
    if (this.tableName === 'table_definition') {
      body = await validateDto(CreateTableDto, body);
      const table = await this.tableHandlerService.createTable(body);
      return this.find(table.id);
    }
    const result: any = await this.repo.save(body);
    return await this.find(result.id);
  }

  async update(id: string | number, body: any) {
    if (this.tableName === 'table_definition') {
      body = await validateDto(CreateTableDto, body);
      const table = await this.tableHandlerService.updateTable(+id, body);
      return this.find(table.id);
    }
    const exists = await this.repo.findOne({
      where: {
        id,
      },
    });
    if (!exists) throw new BadRequestException(`id ${id} is not exists!`);
    await this.repo.update(id, body);
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
    return `Delete successfully!`;
  }
}
