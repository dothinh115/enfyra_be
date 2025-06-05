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
import { QueryService } from '../query/query.service';
import { match } from 'path-to-regexp';

@Injectable()
export class DynamicService {
  private logger = new Logger(DynamicService.name);
  constructor(
    private dataSourceService: DataSourceService,
    private jwtService: JwtService,
    @InjectRepository(Route_definition)
    private routeRepo: Repository<Route_definition>,
    private queryService: QueryService,
  ) {}

  async dynamicService(req: Request) {
    try {
      const path = req.path;
      const method = req.method;
      let curRoute;
      let params;
      const routes = await this.routeRepo.find({
        where: { method, isEnabled: true },
      });

      for (const route of routes) {
        const matcher = match(route.path, { decode: decodeURIComponent });
        const matched = matcher(path);
        if (matched) {
          curRoute = route;
          params = matched.params;
          break;
        }
      }

      if (!curRoute) throw new NotFoundException();
      const repoMap = curRoute.targetTables.reduce((acc, table) => {
        const repo = this.dataSourceService.getRepository(table.name);

        acc[`$${table.name}Repo`] = repo;
        return acc;
      }, {});

      const queryMap = curRoute.targetTables.reduce((acc, table) => {
        const repository = this.dataSourceService.getRepository(table.name);

        acc[`$${table.name}Query`] = async (id?: any) =>
          await this.queryService.query({
            repository,
            query: req.query,
            ...(id && { id }),
          });
        return acc;
      }, {});

      const logs: any[] = [];

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
        log: (...args) => {
          for (const arg of args) {
            if (
              typeof arg === 'object' &&
              arg !== null &&
              !Array.isArray(arg) &&
              !(arg instanceof Date)
            ) {
              logs.push(arg); // giữ nguyên object
            } else {
              logs.push(
                typeof arg === 'string' ? arg : JSON.stringify(arg, null, 2),
              );
            }
          }
        },
        ...params,
        ...repoMap,
        ...queryMap,
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
