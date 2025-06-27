import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { DataSourceService } from '../data-source/data-source.service';
import { DynamicRepoService } from '../dynamic-repo/dynamic-repo.service';
import { TableHandlerService } from '../table/table.service';
import { QueryEngine } from '../query-builder/query-engine.service';
import { RouteCacheService } from '../redis/route-cache.service';

@Injectable()
export class MeService {
  constructor(
    private dataSourceService: DataSourceService,
    private tableHandlerService: TableHandlerService,
    private queryEngine: QueryEngine,
    private routeCacheService: RouteCacheService,
  ) {}

  async find(req: Request & { user: any }) {
    if (!req.user) throw new UnauthorizedException();
    const repo = new DynamicRepoService({
      fields: req.query.fields as string,
      filter: req.query.filter,
      page: Number(req.query.page ?? 1),
      tableName: 'user_definition',
      limit: Number(req.query.limit ?? 10),
      tableHandlerService: this.tableHandlerService,
      dataSourceService: this.dataSourceService,
      queryEngine: this.queryEngine,
      ...(req.query.meta && {
        meta: req.query.meta as any,
      }),
      ...(req.query.sort && {
        sort: req.query.sort as string,
      }),
      ...(req.query.aggregate && {
        aggregate: req.query.aggregate,
      }),
      routeCacheService: this.routeCacheService,
    });
    await repo.init();
    return repo.find(req.user.id);
  }

  async update(body: any, req: Request & { user: any }) {
    if (!req.user) throw new UnauthorizedException();
    const repo = new DynamicRepoService({
      fields: req.query.fields as string,
      filter: req.query.filter,
      page: Number(req.query.page ?? 1),
      tableName: 'user_definition',
      limit: Number(req.query.limit ?? 10),
      tableHandlerService: this.tableHandlerService,
      dataSourceService: this.dataSourceService,
      queryEngine: this.queryEngine,
      ...(req.query.meta && {
        meta: req.query.meta as any,
      }),
      ...(req.query.sort && {
        sort: req.query.sort as string,
      }),
      ...(req.query.aggregate && {
        aggregate: req.query.aggregate,
      }),
      routeCacheService: this.routeCacheService,
    });
    return await repo.update(req.user.id, body);
  }
}
