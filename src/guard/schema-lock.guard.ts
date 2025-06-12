import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { SchemaReloadService } from '../schema/schema-reload.service';
import { CommonService } from '../common/common.service';

@Injectable()
export class SchemaLockGuard implements CanActivate {
  constructor(
    private schemaReloadService: SchemaReloadService,
    private commonService: CommonService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    while (await this.schemaReloadService.checkLockChangeSchema()) {
      console.log('reloading datasource, waiting...');
      await this.commonService.delay(500);
    }

    return true;
  }
}
