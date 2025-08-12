import { Module } from '@nestjs/common';
import { SchemaStateService } from './services/schema-state.service';
import { SchemaReloadService } from './services/schema-reload.service';
import { MetadataSyncService } from './services/metadata-sync.service';
import { SchemaHistoryService } from './services/schema-history.service';

@Module({
  providers: [
    SchemaStateService,
    SchemaReloadService,
    MetadataSyncService,
    SchemaHistoryService,
  ],
  exports: [
    SchemaStateService,
    SchemaReloadService,
    MetadataSyncService,
    SchemaHistoryService,
  ],
})
export class SchemaManagementModule {}
