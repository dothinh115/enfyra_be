import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { DataSourceService } from '../../../core/database/data-source/data-source.service';
import { DynamicRepository } from '../../dynamic-api/repositories/dynamic.repository';
import { TableHandlerService } from '../../table-management/services/table-handler.service';
import { QueryEngine } from '../../../infrastructure/query-engine/services/query-engine.service';
import { RouteCacheService } from '../../../infrastructure/redis/services/route-cache.service';
import { SystemProtectionService } from '../../dynamic-api/services/system-protection.service';

@Injectable()
export class MeService {
  constructor(
    private dataSourceService: DataSourceService,
    private tableHandlerService: TableHandlerService,
    private queryEngine: QueryEngine,
    private routeCacheService: RouteCacheService,
    private systemProtectionService: SystemProtectionService,
  ) {}

  async find(req: Request & { user: any }) {
    if (!req.user) throw new UnauthorizedException();

    const repo = new DynamicRepository({
      query: req.query,
      tableName: 'user_definition',
      tableHandlerService: this.tableHandlerService,
      dataSourceService: this.dataSourceService,
      queryEngine: this.queryEngine,
      routeCacheService: this.routeCacheService,
      systemProtectionService: this.systemProtectionService,
      currentUser: req.user,
    });
    await repo.init();
    return await repo.find({ where: { id: { _eq: req.user.id } } });
  }

  async update(body: any, req: Request & { user: any }) {
    if (!req.user) throw new UnauthorizedException();

    const repo = new DynamicRepository({
      query: req.query,
      tableName: 'user_definition',
      tableHandlerService: this.tableHandlerService,
      dataSourceService: this.dataSourceService,
      queryEngine: this.queryEngine,
      routeCacheService: this.routeCacheService,
      systemProtectionService: this.systemProtectionService,
      currentUser: req.user,
    });
    await repo.init();
    return await repo.update(req.user.id, body);
  }
}
