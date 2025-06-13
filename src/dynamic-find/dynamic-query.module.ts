import { Global, Module } from '@nestjs/common';
import { DynamicQueryService } from './dynamic-query.service';

@Global()
@Module({
  providers: [DynamicQueryService],
  exports: [DynamicQueryService],
})
export class DynamicQueryModule {}
