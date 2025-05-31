import { ColumnDefinition } from '../entities/column.entity';
import { RelationDefinition } from '../entities/relation.entity';
import { TableDefinition } from '../entities/table.entity';
import { TableController } from '../table/table.controller';
import { TableService } from '../table/table.service';
import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      TableDefinition,
      ColumnDefinition,
      RelationDefinition,
    ]),
  ],
  controllers: [TableController],
  providers: [TableService],
  exports: [TypeOrmModule],
})
export class TableModule {}
