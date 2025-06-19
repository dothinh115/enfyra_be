import { All, Controller, Req } from '@nestjs/common';
import { DynamicService } from './dynamic.service';
import { Request } from 'express';

import { TDynamicContext } from '../utils/types/dynamic-context.type';

@Controller()
export class DynamicController {
  constructor(private readonly dynamicService: DynamicService) {}

  @All('*splat')
  dynamicGetController(
    @Req()
    req: Request & {
      routeData: any & {
        params: any;
        handler: string;
        context: TDynamicContext;
      };
      user: any;
    },
  ) {
    return this.dynamicService.runHandler(req);
  }
}
