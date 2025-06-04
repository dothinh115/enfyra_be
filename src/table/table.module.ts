import { Column_definition } from '../entities/column_definition.entity';
import { Middleware_definition } from '../entities/middleware_definition.entity';
import { Relation_definition } from '../entities/relation_definition.entity';
import { Route_definition } from '../entities/route_definition.entity';
import { Table_definition } from '../entities/table_definition.entity';
import { TableController } from '../table/table.controller';
import { TableHanlderService } from '../table/table.service';
import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Table_definition,
      Column_definition,
      Relation_definition,
      Middleware_definition,
      Route_definition,
    ]),
  ],
  controllers: [TableController],
  providers: [TableHanlderService],
  exports: [TypeOrmModule, TableHanlderService],
})
export class TableModule {}
