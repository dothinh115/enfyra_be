import { Global, Module } from '@nestjs/common';
import { QueryEngine } from './query-engine.service';

@Global()
@Module({
  providers: [QueryEngine],
  exports: [QueryEngine],
})
export class QueryEngineModule {}
