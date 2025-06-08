import { All, Controller, Req, UseGuards } from '@nestjs/common';
import { DynamicService } from './dynamic.service';
import { Request } from 'express';
import { Route_definition } from '../entities/route_definition.entity';
import { DynamicRoleGuard } from '../guard/dynamic-role.guard';

@Controller()
export class DynamicController {
  constructor(private readonly dynamicService: DynamicService) {}

  @UseGuards(DynamicRoleGuard)
  @All('api/*splat')
  dynamicGetController(
    @Req() req: Request & { routeData: Route_definition & { params: any } },
  ) {
    return this.dynamicService.dynamicService(req);
  }
}
