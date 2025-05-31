import { CreateRouteDto } from '../route/dto/create-route.dto';
import { RouteService } from '../route/route.service';
import { Body, Controller, Post } from '@nestjs/common';

@Controller('route')
export class RouteController {
  constructor(private readonly routeService: RouteService) {}
  @Post()
  createRoute(@Body() body: CreateRouteDto) {
    return this.routeService.createRoute(body);
  }
}
