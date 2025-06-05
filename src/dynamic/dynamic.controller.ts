import { All, Controller, Req, UseGuards } from '@nestjs/common';
import { DynamicService } from './dynamic.service';
import { Request } from 'express';
import { DynamicMiddleware } from '../middleware/dynamic.service';

@Controller()
export class DynamicController {
  constructor(private readonly dynamicService: DynamicService) {}

  @UseGuards(DynamicMiddleware)
  @All('*')
  dynamicGetController(@Req() req: Request) {
    return this.dynamicService.dynamicService(req);
  }
}
