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
import { DynamicFindService } from '../dynamic-find/dynamic-find.service';

@Injectable()
export class DynamicService {
  private logger = new Logger(DynamicService.name);

  constructor(
    private dataSourceService: DataSourceService,
    private jwtService: JwtService,
    private dynamicFindService: DynamicFindService,
  ) {}

  async dynamicService(
    req: Request & { routeData: Route_definition & { params: any } },
  ) {
    const logs: any[] = [];

    try {
      const repoEntries = await Promise.all(
        [req.routeData.mainTable, ...req.routeData.targetTables].map(
          async (table) => {
            const repo = await this.dataSourceService.getRepository(table.name);
            return [`$${table.alias ?? table.name}Repo`, repo];
          },
        ),
      );

      const repoMap = Object.fromEntries(repoEntries);

      const dynamicFindEntries = await Promise.all(
        [req.routeData.mainTable, ...req.routeData.targetTables]?.map(
          async (table) => {
            const dynamicFind = await this.dynamicFindService.dynamicFind({
              fields: (req.query.fields as string) ?? '',
              filter: req.query.filter,
              tableName: table.name,
            });
            return [`${table.alias ?? table.name}Find`, dynamicFind];
          },
        ),
      );

      const dynamicFindMap = Object.fromEntries(dynamicFindEntries);

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
