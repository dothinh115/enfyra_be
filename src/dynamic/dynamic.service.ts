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
import { match } from 'path-to-regexp';
import * as qs from 'qs';
import {
  collapseIdOnlyFields,
  extractRelationsAndFieldsAndWhere,
} from '../utils/common';
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
      let curRoute;
      let params;
      const routes = await this.routeRepo.find({
        where: { method, isEnabled: true },
      });

      for (const route of routes) {
        const matcher = match(`/api/${route.path.replace(/^\//, '')}`, {
          decode: decodeURIComponent,
        });
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

      // const queryMap = curRoute.targetTables.reduce((acc, table) => {
      //   const repository = this.dataSourceService.getRepository(table.name);

      //   acc[`$${table.name}Query`] = async (id?: any) =>
      //     await this.queryService.query({
      //       repository,
      //       query: req.query,
      //       ...(id && { id }),
      //     });
      //   return acc;
      // }, {});
      const url = req.originalUrl || req.url;
      let reqQuery: any;

      if (url.includes('?')) {
        const [path, queryString] = url.split('?');
        const parsed = qs.parse(queryString, { depth: 10 });

        // Gán từng key vào req.query (tránh gán thẳng gây lỗi)
        Object.assign(req.query, parsed);

        // Debug log kết quả đã parse
        reqQuery = parsed;
      }
      let filter = {};
      let fields = '';
      if (reqQuery?.filter) {
        filter = reqQuery.filter;
      }
      if (reqQuery?.fields) {
        fields = reqQuery.fields;
      }

      const repo = this.dataSourceService.getRepository('category');
      const extractResult = extractRelationsAndFieldsAndWhere({
        fields,
        filter,
        rootTableName: 'category',
        dataSource: this.dataSourceService.getDataSource(),
      });

      const qb = repo.createQueryBuilder('category');
      qb.select(extractResult.select);
      for (const join of extractResult.joinArr) {
        qb.leftJoin(join.path, join.alias);
      }
      qb.where(extractResult.where).setParameters(extractResult.params);
      console.log(qb.getQuery(), qb.getParameters());
      const result = await qb.getMany();
      return collapseIdOnlyFields(result);
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
      };

      // Tạo sandbox và chạy script
      const script = new vm.Script(`(async () => { ${curRoute.handler} })()`);
      const vmContext = vm.createContext(context);
      // const result = await script.runInContext(vmContext, { timeout: 3000 });

      return {};
    } catch (error) {
      this.logger.error('❌ Script lỗi:', error.message);
      this.logger.debug(error.stack);
      console.dir(error, { depth: null });

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
