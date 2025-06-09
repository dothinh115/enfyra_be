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
import { DynamicRepoService } from '../dynamic-repo/dynamic-repo.service';
import { TableHandlerService } from '../table/table.service';
import { TDynamicContext } from '../utils/types/dynamic-context.type';
import { User_definition } from '../entities/user_definition.entity';

@Injectable()
export class DynamicService {
  private logger = new Logger(DynamicService.name);

  constructor(
    private dataSourceService: DataSourceService,
    private jwtService: JwtService,
    private dynamicFindService: DynamicFindService,
    private tableHandlerService: TableHandlerService,
  ) {}

  async dynamicService(
    req: Request & {
      routeData: Route_definition & { params: any };
      user: User_definition;
    },
  ) {
    const logs: any[] = [];

    try {
      const dynamicFindEntries = await Promise.all(
        [req.routeData.mainTable, ...req.routeData.targetTables]?.map(
          async (table) => {
            const dynamicRepo = new DynamicRepoService({
              fields: req.query.fields as string,
              filter: req.query.filter,
              page: Number(req.query.page ?? 1),
              tableName: table.name,
              limit: Number(req.query.limit ?? 10),
              tableHandlerService: this.tableHandlerService,
              dataSourceService: this.dataSourceService,
              dynamicFindService: this.dynamicFindService,
            });
            const name =
              table.name === req.routeData.mainTable.name
                ? 'main'
                : (table.alias ?? table.name);
            return [`$${name}`, dynamicRepo];
          },
        ),
      );

      const dynamicFindMap = Object.fromEntries(dynamicFindEntries);
      console.log(dynamicFindMap);

      const context: TDynamicContext = {
        $body: req.body,
        $errors: {
          throw400: (msg: string) => {
            throw new BadRequestException(msg);
          },
          throw401: () => {
            throw new UnauthorizedException();
          },
        },
        $logs(...args) {
          logs.push(...args);
        },
        $helpers: {
          $jwt: (payload: any, ext: string) =>
            this.jwtService.sign(payload, { expiresIn: ext }),
        },
        $params: req.routeData.params ?? {},
        $query: req.query ?? {},
        $user: req.user ?? undefined,
        $repos: dynamicFindMap,
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
