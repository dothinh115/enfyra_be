import { Global, Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { ConfigModule } from '@nestjs/config';
import { DynamicModule } from './dynamic/dynamic.module';
import { TableModule } from './table/table.module';
import { RouteModule } from './route/route.module';
import * as path from 'path';
import { RabbitMQRegistry } from './rabbitmq/rabbitmq.service';
import { DataSourceModule } from './data-source/data-source.module';
import { AutoGenerateService } from './auto-generate/auto-generate.service';
import { CommonModule } from './common/common.module';
import { BootstrapService } from './bootstrap/bootstrap.service';

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
  ],
  providers: [
    BootstrapService,
    RabbitMQRegistry,
    AutoGenerateService,
    DataSourceModule,
  ],
  exports: [RabbitMQRegistry, AutoGenerateService, DataSourceModule],
})
export class AppModule {}
