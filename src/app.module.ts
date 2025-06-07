import { forwardRef, Global, Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DynamicModule } from './dynamic/dynamic.module';
import { TableModule } from './table/table.module';
import { RouteModule } from './route/route.module';
import * as path from 'path';
import { RabbitMQRegistry } from './rabbitmq/rabbitmq.service';
import { DataSourceModule } from './data-source/data-source.module';
import { CommonModule } from './common/common.module';
import { BootstrapService } from './bootstrap/bootstrap.service';
import { AutoGenerateModule } from './auto/auto.module';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './guard/jwt-auth.guard';
import { JwtStrategy } from './auth/jwt.strategy';
import { JwtModule } from '@nestjs/jwt';
import { RoleGuard } from './guard/role.guard';
import { DynamicFindModule } from './dynamic-find/dynamic-find.module';
import { HideFieldInterceptor } from './interceptors/hidden-field.interceptor';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: path.resolve(__dirname, '../.env'),
    }),
    TableModule,
    DatabaseModule,
    DynamicModule,
    RouteModule,
    CommonModule,
    DataSourceModule,
    AutoGenerateModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        return {
          secret: configService.get('SECRET_KEY'),
        };
      },
      inject: [ConfigService],
    }),
    DynamicFindModule,
  ],
  providers: [
    BootstrapService,
    RabbitMQRegistry,
    JwtStrategy,
    HideFieldInterceptor,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RoleGuard },
  ],
  exports: [RabbitMQRegistry, DataSourceModule, JwtModule],
})
export class AppModule {}
