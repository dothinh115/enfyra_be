import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import * as vm from 'vm';
import { DataSourceService } from '../data-source/data-source.service';

@Injectable()
export class DynamicService {
  private logger = new Logger(DynamicService.name);
  constructor(private dataSourceService: DataSourceService) {}

  async dynamicService(req: Request, body?: any) {
    try {
      const path = req.path;
      const method = req.method;
      const curRouteRepo = this.dataSourceService.getRepository('route');
      const curRoute: any = await curRouteRepo.findOne({
        where: {
          path,
          method,
        },
      });
      if (!curRoute)
        throw new BadRequestException(`[${method}] ${path} không tồn tại!`);
      const curRepo = this.dataSourceService.getRepository(
        curRoute.targetTable.name,
      );
      const context = {
        $req: req,
        $body: body,
        $repo: curRepo,
        throw400: (message: string) => new BadRequestException(message),
        throw401: () => new UnauthorizedException(),
      };
      // Tạo context sandbox
      const script = new vm.Script(`(async () => { ${curRoute.handler} })()`);
      const vmContext = vm.createContext(context);

      // Phải `await` Promise trả ra từ script
      const result = await script.runInContext(vmContext);

      return result;
    } catch (error) {
      this.logger.error(error);
      throw error;
      throw new BadRequestException(`Lỗi script db: ${error.message}`);
    }
  }
}
