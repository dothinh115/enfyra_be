import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import * as vm from 'vm';
import { Route_definition } from '../entities/route_definition.entity';
import { User_definition } from '../entities/user_definition.entity';
import { TDynamicContext } from '../utils/types/dynamic-context.type';

@Injectable()
export class DynamicService {
  private logger = new Logger(DynamicService.name);

  async dynamicService(
    req: Request & {
      routeData: Route_definition & {
        params: any;
        handler: string;
        context: TDynamicContext;
      };
      user: User_definition;
    },
  ) {
    const logs: any[] = [];
    req.routeData.context.$logs = (...args: any[]) => {
      logs.push(...args);
    };
    try {
      let handler: string;
      switch (req.method) {
        case 'DELETE':
          handler = `return await $repos.main.delete($params.id);`;
          break;
        case 'POST':
          handler = `return await $repos.main.create($body);`;
          break;
        case 'PATCH':
          handler = `return await $repos.main.update($params.id, $body);`;
          break;
        default:
          handler = `return await $repos.main.find()`;
      }
      if (req.routeData.handler) handler = req.routeData.handler;

      const script = new vm.Script(`(async () => { ${handler} })()`);
      const vmContext = vm.createContext(req.routeData.context);
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
