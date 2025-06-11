import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { MeService } from './me.service';
import { Public } from '../decorators/public-route.decorator';
import { Request } from 'express';
import { User_definition } from '../entities/user_definition.entity';

@Controller('me')
export class MeController {
  constructor(private readonly meService: MeService) {}

  @Get()
  @Public()
  find(@Req() req: Request & { user: User_definition }) {
    return this.meService.find(req);
  }

  @Post()
  @Public()
  update(@Body() body: any, @Req() req: Request & { user: User_definition }) {}
}
