import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import * as vm from 'vm';
import { DataSourceService } from '../data-source/data-source.service';
import { JwtService } from '@nestjs/jwt';
import { Route_definition } from '../entities/route_definition.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@Injectable()
export class DynamicService {
  private logger = new Logger(DynamicService.name);
  constructor(
    private dataSourceService: DataSourceService,
    private jwtService: JwtService,
    @InjectRepository(Route_definition)
    private routeRepo: Repository<Route_definition>,
  ) {}

  async dynamicService(req: Request) {
    try {
      const path = req.path;
      const method = req.method;

      const curRoute = await this.routeRepo.findOne({
        where: { path, method },
      });

      if (!curRoute || !curRoute.isEnabled) throw new NotFoundException();
      const repoMap = curRoute.targetTables.reduce((acc, table) => {
        acc[`$${table.name}Repo`] = this.dataSourceService.getRepository(
          table.name,
        );
        return acc;
      }, {});

      const context = {
        $req: req,
        $body: req.body,
        $jwt: (payload: any, ext: string) =>
          this.jwtService.sign(payload, { expiresIn: ext }),
        throw400: (message: string) => {
          throw new BadRequestException(message);
        },
        throw401: () => {
          throw new UnauthorizedException();
        },
        ...repoMap,
      };

      // Tạo sandbox và chạy script
      const script = new vm.Script(`(async () => { ${curRoute.handler} })()`);
      const vmContext = vm.createContext(context);
      const result = await script.runInContext(vmContext, { timeout: 3000 });

      return result;
    } catch (error) {
      this.logger.error('❌ Script lỗi:', error.message);
      this.logger.debug(error.stack);

      if (
        error instanceof UnauthorizedException ||
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error; // Trả nguyên trạng
      }

      throw new BadRequestException(
        `Lỗi script database hoặc handler:`,
        error.message,
      );
    }
  }
}
