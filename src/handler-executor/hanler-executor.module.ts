import { Global, Module } from '@nestjs/common';
import { HandlerExecutorService } from './handler-executor.service';
import { ExecutorPoolService } from './executor-pool.service';

@Global()
@Module({
  providers: [HandlerExecutorService, ExecutorPoolService],
  exports: [HandlerExecutorService, ExecutorPoolService],
})
export class HandlerExecutorModule {}
