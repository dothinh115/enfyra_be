import { CommonService } from '../common/common.service';
import { Global, Module } from '@nestjs/common';
import { QueryTrackerService } from '../query-track/query-track.service';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { QueryTrackerInterceptor } from './query-tracker.interceptor';

@Global()
@Module({
  providers: [
    CommonService,
    QueryTrackerService,
    {
      provide: APP_INTERCEPTOR,
      useClass: QueryTrackerInterceptor,
    },
  ],
  exports: [CommonService, QueryTrackerService],
})
export class CommonModule {}
