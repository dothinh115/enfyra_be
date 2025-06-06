import { All, Controller, Next, Req, UseGuards } from '@nestjs/common';
import { DynamicService } from './dynamic.service';
import { NextFunction, Request } from 'express';
import { DynamicMiddleware } from '../middleware/dynamic.service';

@Controller()
export class DynamicController {
  constructor(private readonly dynamicService: DynamicService) {}

  @UseGuards(DynamicMiddleware)
  @All('api/*splat')
  dynamicGetController(@Req() req: Request) {
    return this.dynamicService.dynamicService(req);
  }
}
