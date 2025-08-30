import * as path from 'path';
import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { RedisModule } from '@liaoliaots/nestjs-redis';

import { ConfigModule, AppConfigService } from './core/config';
import {
  AuthModule,
  JwtAuthGuard,
  RoleGuard,
  JwtStrategy,
  BootstrapModule,
  DataSourceModule,
  ExceptionsModule,
  RequestContextMiddleware,
} from './core';
import {
  HandlerExecutorModule,
  QueryEngineModule,
  RedisPubSubService,
  RouteCacheService,
} from './infrastructure';
import {
  AutoModule,
  DynamicModule,
  SystemProtectionService,
  GraphqlModule,
  MeModule,
  FileManagementService,
  SchemaManagementModule,
  TableModule,
  FileManagementModule,
} from './modules';
import {
  CommonModule,
  NotFoundDetectGuard,
  DynamicInterceptor,
  HideFieldInterceptor,
  FileUploadMiddleware,
  ParseQueryMiddleware,
  RouteDetectMiddleware,
} from './shared';
import { SqlFunctionService } from './infrastructure/sql/services/sql-function.service';

@Global()
@Module({
  imports: [
    ConfigModule,
    ExceptionsModule,
    TableModule,
    CommonModule,
    DataSourceModule,
    AutoModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (appConfigService: AppConfigService) => {
        return appConfigService.getJwtModuleOptions();
      },
      inject: [AppConfigService],
    }),
    RedisModule.forRootAsync({
      imports: [ConfigModule],
      inject: [AppConfigService],
      useFactory: async (...args: unknown[]) => {
        const appConfigService = args[0] as AppConfigService;
        return appConfigService.getRedisConnectionOptions();
      },
    }),
    QueryEngineModule,
    AuthModule,
    FileManagementModule,
    MeModule,
    DynamicModule,
    BootstrapModule,
    GraphqlModule,
    HandlerExecutorModule,
    SchemaManagementModule,
  ],
  providers: [
    JwtStrategy,
    HideFieldInterceptor,
    RedisPubSubService,
    SqlFunctionService,
    RouteCacheService,
    SystemProtectionService,
    FileManagementService,
    { provide: APP_GUARD, useClass: NotFoundDetectGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RoleGuard },
    { provide: APP_INTERCEPTOR, useClass: DynamicInterceptor },
    { provide: APP_INTERCEPTOR, useClass: HideFieldInterceptor },
  ],
})
export class AppModule implements NestModule {
  constructor(private readonly appConfigService: AppConfigService) {
    // Validate configuration on startup
    if (!this.appConfigService.validateConfig()) {
      throw new Error(
        'Configuration validation failed. Please check your environment variables.'
      );
    }
  }

  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(
        RequestContextMiddleware,
        ParseQueryMiddleware,
        RouteDetectMiddleware
      )
      .forRoutes('*');
    consumer.apply(FileUploadMiddleware).forRoutes('file_definition');
  }
}
