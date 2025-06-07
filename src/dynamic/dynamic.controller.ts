import { All, Controller, Req } from '@nestjs/common';
import { DynamicService } from './dynamic.service';
import { Request } from 'express';

@Controller()
export class DynamicController {
  constructor(private readonly dynamicService: DynamicService) {}

  @All('api/*splat')
  dynamicGetController(@Req() req: Request) {
    return this.dynamicService.dynamicService(req);
  }
}
