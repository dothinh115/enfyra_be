import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { SchemaReloadService } from '../schema/schema-reload.service';

@Injectable()
export class SchemaLockGuard implements CanActivate {
  constructor(private schemaReloadService: SchemaReloadService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    while (await this.schemaReloadService.checkLockChangeSchema()) {
      await new Promise((resolve) => setTimeout(() => resolve(true), 500));
    }
    return true;
  }
}
