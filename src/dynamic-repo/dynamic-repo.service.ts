import { BadRequestException } from '@nestjs/common';
import { DynamicFindService } from '../dynamic-find/dynamic-find.service';
import { DataSourceService } from '../data-source/data-source.service';
import { Repository } from 'typeorm';
import { Table_definition } from '../entities/table_definition.entity';
import { validateDto } from '../utils/helpers';
import { TableHandlerService } from '../table/table.service';
import { CreateTableDto } from '../table/dto/create-table.dto';

export class DynamicRepoService {
  private fields: string;
  private filter: any;
  private page: number;
  private limit: number;
  private tableName: string;
  private dynamicFindService: DynamicFindService;
  private dataSourceService: DataSourceService;
  private repo: Repository<any>;
  private tableHandlerService: TableHandlerService;
  constructor({
    fields = '',
    filter = {},
    page = 1,
    limit = 10,
    tableName,
    dynamicFindService,
    dataSourceService,
    tableHandlerService,
  }: {
    fields: string;
    filter: any;
    page: number;
    limit: number;
    tableName: string;
    dynamicFindService: DynamicFindService;
    dataSourceService: DataSourceService;
    tableHandlerService: TableHandlerService;
  }) {
    this.fields = fields;
    this.filter = filter;
    this.page = page;
    this.limit = limit;
    this.tableName = tableName;
    this.dynamicFindService = dynamicFindService;
    this.dataSourceService = dataSourceService;
    this.tableHandlerService = tableHandlerService;
  }

  async init() {
    this.repo = await this.dataSourceService.getRepository(this.tableName);
  }

  async find(id?: string | number) {
    return await this.dynamicFindService.dynamicFind({
      fields: this.fields,
      filter: id ? { ...this.filter, id: { _eq: id } } : this.filter,
      page: this.page,
      limit: this.limit,
      tableName: this.tableName,
    });
  }

  async create(body: any) {
    const tableNameFromEntity =
      this.dataSourceService.getTableNameFromEntity(Table_definition);
    if (this.tableName === tableNameFromEntity) {
      body = await validateDto(CreateTableDto, body);
      const table = await this.tableHandlerService.createTable(body);
      return this.find(table.id);
    }
    const result: any = await this.repo.create(body);
    return this.find(result.id);
  }

  async update(id: string | number, body: any) {
    const exists = await this.repo.findOne({
      where: {
        id,
      },
    });
    if (!exists) throw new BadRequestException(`id ${id} is not exists!`);
    await this.repo.update(id, body);
    return this.find(id);
  }

  async delete(id: string | number) {
    const exists = await this.repo.findOne({
      where: {
        id,
      },
    });
    if (!exists) throw new BadRequestException(`id ${id} is not exists!`);
    return `Delete successfully!`;
  }
}
