import { ColumnDefinition } from '../entities/column.entity';
import { MiddlewareDefinition } from '../entities/middleware.entity';
import { RelationDefinition } from '../entities/relation.entity';
import { TableDefinition } from '../entities/table.entity';
import { TableController } from '../table/table.controller';
import { TableHanlderService } from '../table/table.service';
import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      TableDefinition,
      ColumnDefinition,
      RelationDefinition,
      MiddlewareDefinition,
    ]),
  ],
  controllers: [TableController],
  providers: [TableHanlderService],
  exports: [TypeOrmModule, TableHanlderService],
})
export class TableModule {}
