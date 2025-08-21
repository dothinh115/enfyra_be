import { Module } from '@nestjs/common';
import { FileManagementService } from './services/file-management.service';
import { FileAssetsService } from './services/file-assets.service';
import { AssetsController } from './controllers/assets.controller';
import { FileController } from './controllers/file.controller';
import { DataSourceModule } from '../../core/database/data-source/data-source.module';
import { QueryEngineModule } from '../../infrastructure/query-engine/query-engine.module';
import { RedisModule } from '../../infrastructure/redis/redis.module';
import { DynamicModule } from '../dynamic-api/dynamic.module';
import { TableModule } from '../table-management/table.module';
import { FolderManagementModule } from '../folder-management/folder-management.module';

@Module({
  imports: [
    DataSourceModule, 
    QueryEngineModule, 
    RedisModule, 
    DynamicModule,
    TableModule,
    FolderManagementModule
  ],
  controllers: [AssetsController, FileController],
  providers: [FileManagementService, FileAssetsService],
  exports: [FileManagementService, FileAssetsService],
})
export class FileManagementModule {}