import { All, Controller, Req } from '@nestjs/common';
import { DynamicService } from './dynamic.service';
import { Request } from 'express';
import { Route_definition } from '../entities/route_definition.entity';
import { User_definition } from '../entities/user_definition.entity';

@Controller()
export class DynamicController {
  constructor(private readonly dynamicService: DynamicService) {}

  @All('api/*splat')
  dynamicGetController(
    @Req()
    req: Request & {
      routeData: Route_definition & { params: any; handler: string };
      user: User_definition;
    },
  ) {
    return this.dynamicService.dynamicService(req);
  }
}
