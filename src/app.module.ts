import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DynamicModule } from './modules/dynamic-api/dynamic.module';
import { TableModule } from './modules/table-management/table.module';
import * as path from 'path';
import { RabbitMQRegistry } from './infrastructure/rabbitmq/services/rabbitmq.service';
import { DataSourceModule } from './core/database/data-source/data-source.module';
import { CommonModule } from './shared/common/common.module';
import { AutoModule } from './modules/code-generation/auto.module';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtAuthGuard } from './core/auth/guards/jwt-auth.guard';
import { JwtStrategy } from './core/auth/services/jwt.strategy';
import { JwtModule } from '@nestjs/jwt';
import { HideFieldInterceptor } from './shared/interceptors/hidden-field.interceptor';
import { AuthModule } from './core/auth/auth.module';
import { RoleGuard } from './core/auth/guards/role.guard';
import { MeModule } from './modules/user/me.module';
import { RouteDetectMiddleware } from './shared/middleware/route-detect.middleware';
import { NotFoundDetectGuard } from './core/auth/guards/not-found-detect.guard';
import { SchemaReloadService } from './modules/schema-management/services/schema-reload.service';
import { RedisPubSubService } from './infrastructure/redis/services/redis-pubsub.service';
import { SchemaStateService } from './modules/schema-management/services/schema-state.service';
import { SchemaLockGuard } from './core/auth/guards/schema-lock.guard';
import { SqlFunctionService } from './infrastructure/sql/services/sql-function.service';
import { MetadataSyncService } from './modules/schema-management/services/metadata-sync.service';
import { SchemaHistoryService } from './modules/schema-management/services/schema-history.service';
import { BootstrapModule } from './core/bootstrap/bootstrap.module';
import { RedisModule } from '@liaoliaots/nestjs-redis';
import { GraphqlModule } from './modules/graphql/graphql.module';
import { QueryEngineModule } from './infrastructure/query-engine/query-engine.module';
import { DynamicInterceptor } from './shared/interceptors/dynamic.interceptor';
import { HandlerExecutorModule } from './infrastructure/handler-executor/hanler-executor.module';
import { RouteCacheService } from './infrastructure/redis/services/route-cache.service';
import { ParseQueryMiddleware } from './shared/middleware/parse-query.middleware';
import { SystemProtectionService } from './modules/dynamic-api/services/system-protection.service';
import { ExceptionsModule } from './core/exceptions/exceptions.module';
import { RequestContextMiddleware } from './core/exceptions/middleware/request-context.middleware';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: path.resolve(__dirname, '../.env'),
    }),
    ExceptionsModule,
    TableModule,
    CommonModule,
    DataSourceModule,
    AutoModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        return {
          secret: configService.get('SECRET_KEY'),
        };
      },
      inject: [ConfigService],
    }),
    RedisModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        config: {
          url: configService.get('REDIS_URI'),
          ttl: configService.get<number>('DEFAULT_TTL'),
        },
      }),
    }),
    QueryEngineModule,
    AuthModule,
    MeModule,
    DynamicModule,
    BootstrapModule,
    GraphqlModule,
    HandlerExecutorModule,
  ],
  providers: [
    // RabbitMQRegistry,
    JwtStrategy,
    HideFieldInterceptor,
    SchemaStateService,
    SchemaReloadService,
    RedisPubSubService,
    SqlFunctionService,
    MetadataSyncService,
    SchemaHistoryService,
    RouteCacheService,
    SystemProtectionService,
    { provide: APP_GUARD, useClass: SchemaLockGuard },
    { provide: APP_GUARD, useClass: NotFoundDetectGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RoleGuard },
    { provide: APP_INTERCEPTOR, useClass: DynamicInterceptor },
    { provide: APP_INTERCEPTOR, useClass: HideFieldInterceptor },
  ],
  exports: [
    // RabbitMQRegistry,
    DataSourceModule,
    JwtModule,
    SchemaReloadService,
    SchemaStateService,
    RedisPubSubService,
    MetadataSyncService,
    SchemaHistoryService,
    RouteCacheService,
    SystemProtectionService,
  ],
})
export class AppModule implements NestModule {
  async configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
    consumer.apply(ParseQueryMiddleware).forRoutes('*');
    consumer.apply(RouteDetectMiddleware).forRoutes('*');
  }
}
