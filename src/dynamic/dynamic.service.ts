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
import { DynamicFindService } from '../dynamic-find/dynamic-find.service';

@Injectable()
export class DynamicService {
  private logger = new Logger(DynamicService.name);

  constructor(
    private dataSourceService: DataSourceService,
    private jwtService: JwtService,
    @InjectRepository(Route_definition)
    private dynamicFindService: DynamicFindService,
  ) {}

  async dynamicService(
    req: Request & { routeData: Route_definition & { params: any } },
  ) {
    const logs: any[] = [];

    try {
      const repoMap = req.routeData.targetTables.reduce((acc, table) => {
        const repo = this.dataSourceService.getRepository(table.name);
        acc[`$${table.alias ?? table.name}Repo`] = repo;
        return acc;
      }, {});

      const dynamicFindMap = req.routeData.targetTables.reduce((acc, table) => {
        acc[`$${table.alias ?? table.name}Find`] =
          this.dynamicFindService.dynamicFind({
            fields:
              typeof req.query.fields === 'string' ? req.query.fields : '',
            filter:
              typeof req.query.filter === 'object' ? req.query.filter : {},
            tableName: table.name,
          });
        return acc;
      }, {});

      const context = {
        $req: req,
        $body: req.body,
        $jwt: (payload: any, ext: string) =>
          this.jwtService.sign(payload, { expiresIn: ext }),
        $throw400: (message: string) => {
          throw new BadRequestException(message);
        },
        $throw401: () => {
          throw new UnauthorizedException();
        },
        $log: (...args: any[]) => {
          for (const arg of args) {
            if (
              typeof arg === 'object' &&
              arg !== null &&
              !Array.isArray(arg) &&
              !(arg instanceof Date)
            ) {
              logs.push(arg);
            } else {
              logs.push(
                typeof arg === 'string' ? arg : JSON.stringify(arg, null, 2),
              );
            }
          }
        },
        ...repoMap,
        ...dynamicFindMap,
        ...(req.routeData.params && { params: req.routeData.params }),
      };

      if (!req.routeData.handler || typeof req.routeData.handler !== 'string') {
        throw new BadRequestException(
          'Handler script không hợp lệ hoặc bị thiếu',
        );
      }

      const script = new vm.Script(
        `(async () => { ${req.routeData.handler} })()`,
      );
      const vmContext = vm.createContext(context);
      const result = await script.runInContext(vmContext, { timeout: 3000 });

      return logs.length ? { result, logs } : result;
    } catch (error) {
      this.logger.error('❌ Lỗi khi chạy handler:', error.message);
      this.logger.debug(error.stack);

      if (
        error instanceof UnauthorizedException ||
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      throw new BadRequestException(
        'Lỗi trong quá trình thực thi script hoặc xử lý dữ liệu.',
        error.message,
      );
    }
  }
}
