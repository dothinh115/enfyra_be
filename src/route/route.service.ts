import { CreateRouteDto } from '../route/dto/create-route.dto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSourceService } from '../data-source/data-source.service';

@Injectable()
export class RouteService {
  constructor(private dataSourceService: DataSourceService) {}

  async createRoute(body: CreateRouteDto) {
    const repo = this.dataSourceService.getRepository('route');
    const exists = await repo.findOne({
      where: {
        method: body.method,
        path: body.path,
      },
    });
    if (exists)
      throw new BadRequestException(
        `[${body.method}] ${body.path} đã tồn tại!`,
      );
    const newRoute = repo.create(body as any);
    return await repo.save(newRoute);
  }
}
