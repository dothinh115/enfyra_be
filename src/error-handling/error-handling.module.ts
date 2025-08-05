import { Global, Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { GlobalExceptionFilter } from './filters/global-exception.filter';
import { LoggingService } from './services/logging.service';
import { RequestContextMiddleware } from './middleware/request-context.middleware';

@Global()
@Module({
  providers: [
    LoggingService,
    GlobalExceptionFilter,
    RequestContextMiddleware,
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
  exports: [LoggingService, GlobalExceptionFilter, RequestContextMiddleware],
})
export class ErrorHandlingModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
