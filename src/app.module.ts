// External packages
import * as path from 'path';

// @nestjs packages
import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { RedisModule } from '@liaoliaots/nestjs-redis';

// Internal imports
import { AuthModule } from './core/auth/auth.module';
import { JwtAuthGuard } from './core/auth/guards/jwt-auth.guard';
import { RoleGuard } from './core/auth/guards/role.guard';
import { JwtStrategy } from './core/auth/services/jwt.strategy';
import { BootstrapModule } from './core/bootstrap/bootstrap.module';
import { DataSourceModule } from './core/database/data-source/data-source.module';
import { ExceptionsModule } from './core/exceptions/exceptions.module';
import { RequestContextMiddleware } from './core/exceptions/middleware/request-context.middleware';
import { HandlerExecutorModule } from './infrastructure/handler-executor/handler-executor.module';
import { QueryEngineModule } from './infrastructure/query-engine/query-engine.module';
import { RedisPubSubService } from './infrastructure/redis/services/redis-pubsub.service';
import { RouteCacheService } from './infrastructure/redis/services/route-cache.service';
import { SqlFunctionService } from './infrastructure/sql/services/sql-function.service';
import { AutoModule } from './modules/code-generation/auto.module';
import { DynamicModule } from './modules/dynamic-api/dynamic.module';
import { SystemProtectionService } from './modules/dynamic-api/services/system-protection.service';
import { GraphqlModule } from './modules/graphql/graphql.module';
import { MeModule } from './modules/me/me.module';
import { FolderManagementModule } from './modules/folder-management/folder-management.module';
import { FileManagementService } from './modules/file-management/services/file-management.service';
import { SchemaManagementModule } from './modules/schema-management/schema-management.module';
import { TableModule } from './modules/table-management/table.module';
import { CommonModule } from './shared/common/common.module';
import { NotFoundDetectGuard } from './shared/guards/not-found-detect.guard';
import { SchemaLockGuard } from './shared/guards/schema-lock.guard';
import { DynamicInterceptor } from './shared/interceptors/dynamic.interceptor';
import { HideFieldInterceptor } from './shared/interceptors/hidden-field.interceptor';
import { FileUploadMiddleware } from './shared/middleware/file-upload.middleware';
import { ParseQueryMiddleware } from './shared/middleware/parse-query.middleware';
import { RouteDetectMiddleware } from './shared/middleware/route-detect.middleware';
import { FileManagementModule } from './modules/file-management/file-management.module';

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
    FolderManagementModule,
    FileManagementModule,
    MeModule,
    DynamicModule,
    BootstrapModule,
    GraphqlModule,
    HandlerExecutorModule,
    SchemaManagementModule,
  ],
  providers: [
    // RabbitMQRegistry,
    JwtStrategy,
    HideFieldInterceptor,
    RedisPubSubService,
    SqlFunctionService,
    RouteCacheService,
    SystemProtectionService,
    FileManagementService,
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
    RedisPubSubService,
    RouteCacheService,
    SchemaManagementModule,
    SystemProtectionService,
  ],
})
export class AppModule implements NestModule {
  async configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
    consumer.apply(ParseQueryMiddleware).forRoutes('*');
    consumer.apply(RouteDetectMiddleware).forRoutes('*');
    consumer.apply(FileUploadMiddleware).forRoutes('file_definition');
  }
}
