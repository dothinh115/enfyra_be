import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DynamicModule } from './dynamic/dynamic.module';
import { TableModule } from './table/table.module';
import * as path from 'path';
import { RabbitMQRegistry } from './rabbitmq/rabbitmq.service';
import { DataSourceModule } from './data-source/data-source.module';
import { CommonModule } from './common/common.module';
import { AutoModule } from './auto/auto.module';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtAuthGuard } from './guard/jwt-auth.guard';
import { JwtStrategy } from './auth/jwt.strategy';
import { JwtModule } from '@nestjs/jwt';
import { HideFieldInterceptor } from './interceptors/hidden-field.interceptor';
import { AuthModule } from './auth/auth.module';
import { RoleGuard } from './guard/role.guard';
import { MeModule } from './me/me.module';
import { RouteDetectMiddleware } from './middleware/route-detect.middleware';
import { DynamicMiddleware } from './middleware/dynamic.middleware';
import { NotFoundDetectGuard } from './guard/not-found-detect.guard';
import { SchemaReloadService } from './schema/schema-reload.service';
import { RedisPubSubService } from './redis-pubsub/redis-pubsub.service';
import { SchemaStateService } from './schema/schema-state.service';
import { SchemaLockGuard } from './guard/schema-lock.guard';
import { SqlFunctionService } from './sql/sql-function.service';
import { SystemRecordProtectGuard } from './guard/system-record-protect.guard';
import { MetadataSyncService } from './metadata/metadata-sync.service';
import { SchemaHistoryService } from './metadata/schema-history.service';
import { BootstrapModule } from './bootstrap/bootstrap.module';
import { RedisModule } from '@liaoliaots/nestjs-redis';
import { GraphqlModule } from './graphql/graphql.module';
import { QueryEngineModule } from './query-builder/query-engine.module';
import { HandlerExecutorService } from './handler-executor/handler-executor.service';
import { DynamicInterceptor } from './interceptors/dynamic.interceptor';
import { HandlerExecutorModule } from './handler-executor/hanler-executor.module';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: path.resolve(__dirname, '../.env'),
    }),
    TableModule,
    DatabaseModule,
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
    RabbitMQRegistry,
    JwtStrategy,
    HideFieldInterceptor,
    SchemaStateService,
    SchemaReloadService,
    RedisPubSubService,
    SqlFunctionService,
    MetadataSyncService,
    SchemaHistoryService,
    { provide: APP_GUARD, useClass: SchemaLockGuard },
    { provide: APP_GUARD, useClass: NotFoundDetectGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RoleGuard },
    { provide: APP_GUARD, useClass: SystemRecordProtectGuard },
    { provide: APP_INTERCEPTOR, useClass: DynamicInterceptor },
    { provide: APP_INTERCEPTOR, useClass: HideFieldInterceptor },
  ],
  exports: [
    RabbitMQRegistry,
    DataSourceModule,
    JwtModule,
    SchemaReloadService,
    SchemaStateService,
    RedisPubSubService,
    MetadataSyncService,
    SchemaHistoryService,
  ],
})
export class AppModule implements NestModule {
  constructor(private readonly redisPubSubService: RedisPubSubService) {}

  async configure(consumer: MiddlewareConsumer) {
    consumer.apply(RouteDetectMiddleware).forRoutes('*');
    consumer.apply(DynamicMiddleware).forRoutes('*');
  }
}
