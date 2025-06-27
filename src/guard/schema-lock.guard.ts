import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CommonService } from '../common/common.service';
import { SCHEMA_LOCK_EVENT_KEY } from '../utils/constant';
import { RedisLockService } from '../redis/redis-lock.service';

@Injectable()
export class SchemaLockGuard implements CanActivate {
  constructor(
    private commonService: CommonService,
    private redisLockService: RedisLockService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const maxWaitTimeMs = 10000;
    const intervalMs = 500;
    let waited = 0;

    while (await this.redisLockService.get(SCHEMA_LOCK_EVENT_KEY)) {
      console.log('🔁 Reloading schema, waiting...');
      if (waited >= maxWaitTimeMs) {
        throw new ServiceUnavailableException(
          'Schema đang được reload, vui lòng thử lại sau.',
        );
      }
      await this.commonService.delay(intervalMs);
      waited += intervalMs;
    }

    return true;
  }
}
