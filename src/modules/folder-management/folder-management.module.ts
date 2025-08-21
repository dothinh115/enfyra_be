import { Module } from '@nestjs/common';
import { FolderManagementService } from './services/folder-management.service';
import { FolderController } from './controllers/folder.controller';

@Module({
  imports: [],
  controllers: [FolderController],
  providers: [FolderManagementService],
  exports: [FolderManagementService],
})
export class FolderManagementModule {}