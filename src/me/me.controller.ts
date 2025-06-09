import { Controller, Get } from '@nestjs/common';
import { MeService } from './me.service';
import { Public } from '../decorators/public-route.decorator';

@Controller('me')
export class MeController {
  constructor(private readonly meService: MeService) {}

  @Get()
  @Public()
  find() {}
}
