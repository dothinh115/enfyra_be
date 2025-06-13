import { Body, Controller, Get, Patch, Req } from '@nestjs/common';
import { MeService } from './me.service';
import { Public } from '../decorators/public-route.decorator';
import { Request } from 'express';
import { User_definition } from '../entities/user_definition.entity';

@Controller('me')
export class MeController {
  constructor(private readonly meService: MeService) {}

  @Public()
  @Get()
  find(@Req() req: Request & { user: User_definition }) {
    return this.meService.find(req);
  }

  @Public()
  @Patch()
  update(@Body() body: any, @Req() req: Request & { user: User_definition }) {
    return this.meService.update(body, req);
  }
}
