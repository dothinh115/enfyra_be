import { forwardRef, Module } from '@nestjs/common';
import { CommonModule } from '../../shared/common/common.module';
import { ExceptionsModule } from '../../core/exceptions/exceptions.module';
import { RedisModule } from '../../infrastructure/redis/redis.module';
import { SchemaStateService } from './services/schema-state.service';
import { SchemaReloadService } from './services/schema-reload.service';
import { MetadataSyncService } from './services/metadata-sync.service';
import { SchemaHistoryService } from './services/schema-history.service';

@Module({
  imports: [CommonModule, ExceptionsModule, forwardRef(() => RedisModule)],
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
