import { Column_definition } from '../entities/column_definition.entity';
import { Hook_definition } from '../entities/hook_definition.entity';
import { Middleware_definition } from '../entities/middleware_definition.entity';
import { Relation_definition } from '../entities/relation_definition.entity';
import { Role_definition } from '../entities/role_definition.entity';
import { Route_definition } from '../entities/route_definition.entity';
import { Session_definition } from '../entities/session_definition.entity';
import { Setting_definition } from '../entities/setting_definition.entity';
import { Table_definition } from '../entities/table_definition.entity';
import { User_definition } from '../entities/user_definition.entity';
import { TableController } from '../table/table.controller';
import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TableHandlerService } from './table.service';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Table_definition,
      Column_definition,
      Relation_definition,
      Middleware_definition,
      Route_definition,
      User_definition,
      Hook_definition,
      Role_definition,
      Route_definition,
      Setting_definition,
      Session_definition,
    ]),
  ],
  controllers: [TableController],
  providers: [TableHandlerService],
  exports: [TypeOrmModule, TableHandlerService],
})
export class TableModule {}
