import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { DynamicService } from './dynamic.service';
import { Request } from 'express';

@Controller()
export class DynamicController {
  constructor(private readonly dynamicService: DynamicService) {}

  @Get('*')
  @Patch('*')
  @Delete('*')
  dynamicGetController(@Req() req: Request) {
    return this.dynamicService.dynamicService(req);
  }

  @Post('*')
  dynamicPostController(@Req() req: Request, @Body() body: any) {
    return this.dynamicService.dynamicService(req, body);
  }
}
