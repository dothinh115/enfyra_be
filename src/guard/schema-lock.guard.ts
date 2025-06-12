import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SchemaReloadService } from '../schema/schema-reload.service';
import { CommonService } from '../common/common.service';

@Injectable()
export class SchemaLockGuard implements CanActivate {
  constructor(
    private schemaReloadService: SchemaReloadService,
    private commonService: CommonService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const maxWaitTimeMs = 10000;
    const intervalMs = 500;
    let waited = 0;

    while (await this.schemaReloadService.checkLockChangeSchema()) {
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
