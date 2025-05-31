import { HookDefinition } from '../entities/hook.entity';
import { RouteDefenition } from '../entities/route.entity';
import { RouteController } from '../route/route.controller';
import { RouteService } from '../route/route.service';
import { Global, Module } from '@nestjs/common';

import { TypeOrmModule } from '@nestjs/typeorm';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([RouteDefenition, HookDefinition])],
  controllers: [RouteController],
  providers: [RouteService],
  exports: [TypeOrmModule],
})
export class RouteModule {}
