import { CommonService } from '../common/common.service';
import { Global, Module } from '@nestjs/common';
import { RedisLockService } from '../redis/redis-lock.service';

@Global()
@Module({
  providers: [CommonService, RedisLockService],
  exports: [CommonService, RedisLockService],
})
export class CommonModule {}
