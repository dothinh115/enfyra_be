import { Module } from '@nestjs/common';
import { FolderManagementService } from './services/folder-management.service';
import { FolderController } from './controllers/folder.controller';
import { DataSourceModule } from '../../core/database/data-source/data-source.module';
import { QueryEngineModule } from '../../infrastructure/query-engine/query-engine.module';
import { RedisModule } from '../../infrastructure/redis/redis.module';
import { TableModule } from '../table-management/table.module';
import { DynamicModule } from '../dynamic-api/dynamic.module';

@Module({
  imports: [
    DataSourceModule,
    QueryEngineModule, 
    RedisModule,
    TableModule,
    DynamicModule
  ],
  controllers: [FolderController],
  providers: [FolderManagementService],
  exports: [FolderManagementService],
})
export class FolderManagementModule {}