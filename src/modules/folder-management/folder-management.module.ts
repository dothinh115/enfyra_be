import { Module } from '@nestjs/common';
import { FolderManagementService } from './services/folder-management.service';

@Module({
  providers: [FolderManagementService],
  exports: [FolderManagementService],
})
export class FolderManagementModule {}