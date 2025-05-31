import { RouteDefenition } from '../entities/route.entity';
import { CreateRouteDto } from '../route/dto/create-route.dto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@Injectable()
export class RouteService {
  constructor(
    @InjectRepository(RouteDefenition)
    private routeDefRepo: Repository<RouteDefenition>,
  ) {}

  async createRoute(body: CreateRouteDto) {
    const exists = await this.routeDefRepo.findOne({
      where: {
        method: body.method,
        path: body.path,
      },
    });
    if (exists)
      throw new BadRequestException(
        `[${body.method}] ${body.path} đã tồn tại!`,
      );
    const newRoute = this.routeDefRepo.create(body);
    return await this.routeDefRepo.save(newRoute);
  }
}
