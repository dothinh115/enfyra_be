import { Global, Module } from '@nestjs/common';
import { ExceptionsModule } from '../../core/exceptions/exceptions.module';
import { QueryEngine } from './services/query-engine.service';

@Global()
@Module({
  imports: [ExceptionsModule],
  providers: [QueryEngine],
  exports: [QueryEngine],
})
export class QueryEngineModule {}
