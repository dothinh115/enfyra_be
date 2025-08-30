import { forwardRef, Module } from '@nestjs/common';
import { CommonModule } from '../../shared/common/common.module';
import { SchemaManagementModule } from '../../modules/schema-management/schema-management.module';
import { RedisLockService } from './services/redis-lock.service';
import { RedisPubSubService } from './services/redis-pubsub.service';
import { RouteCacheService } from './services/route-cache.service';

@Module({
  imports: [CommonModule, forwardRef(() => SchemaManagementModule)],
  providers: [RedisLockService, RedisPubSubService, RouteCacheService],
  exports: [RedisLockService, RedisPubSubService, RouteCacheService],
})
export class RedisModule {}
