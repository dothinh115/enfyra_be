import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import * as vm from 'vm';
import { DataSourceService } from '../data-source/data-source.service';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class DynamicService {
  private logger = new Logger(DynamicService.name);
  constructor(
    private dataSourceService: DataSourceService,
    private jwtService: JwtService,
  ) {}

  async dynamicService(req: Request) {
    try {
      const path = req.path;
      const method = req.method;

      const curRouteRepo = this.dataSourceService.getRepository('route');
      const curRoute: any = await curRouteRepo?.findOne({
        where: { path, method },
      });

      if (!curRoute) {
        throw new BadRequestException(`[${method}] ${path} không tồn tại!`);
      }

      const curRepo = this.dataSourceService.getRepository(
        curRoute.targetTable?.name,
      );

      const context = {
        $req: req,
        $body: req.body,
        $jwt: (payload: any, ext: string) =>
          this.jwtService.sign(payload, { expiresIn: ext }),
        ...(curRepo && { $repo: curRepo }),
        throw400: (message: string) => {
          throw new BadRequestException(message);
        },
        throw401: () => {
          throw new UnauthorizedException();
        },
      };

      // Tạo sandbox và chạy script
      const script = new vm.Script(`(async () => { ${curRoute.handler} })()`);
      const vmContext = vm.createContext(context);
      const result = await script.runInContext(vmContext, { timeout: 3000 });

      return result;
    } catch (error) {
      this.logger.error('❌ Script lỗi:', error.message);
      this.logger.debug(error.stack);

      if (error instanceof UnauthorizedException) {
        throw error; // Trả nguyên trạng
      }

      if (error instanceof BadRequestException) {
        throw error; // Trả nguyên trạng
      }

      throw new BadRequestException(`Lỗi script database hoặc handler.`);
    }
  }
}
