import { Module } from '@nestjs/common';
import { FileManagementService } from './services/file-management.service';
import { FileAssetsService } from './services/file-assets.service';
import { AssetsController } from './controllers/assets.controller';
import { DataSourceModule } from '../../core/database/data-source/data-source.module';

@Module({
  imports: [DataSourceModule],
  controllers: [AssetsController],
  providers: [FileManagementService, FileAssetsService],
  exports: [FileManagementService, FileAssetsService],
})
export class FileManagementModule {}