import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import * as vm from 'vm';
import { TDynamicContext } from '../utils/types/dynamic-context.type';

@Injectable()
export class DynamicService {
  private logger = new Logger(DynamicService.name);

  async dynamicService(
    req: Request & {
      routeData: any & {
        params: any;
        handler: string;
        context: TDynamicContext;
      };
      user: any;
    },
  ) {
    const logs: any[] = [];
    req.routeData.context.$logs = (...args: any[]) => {
      logs.push(...args);
    };

    try {
      const userHandler = req.routeData.handler?.trim();
      const defaultHandler = this.getDefaultHandler(req.method);
      if (!userHandler && !defaultHandler)
        throw new BadRequestException('Không có handler tương ứng');

      const scriptCode = `(async () => { ${userHandler || defaultHandler} })()`;

      const script = new vm.Script(scriptCode);
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

  private getDefaultHandler(method: string): string {
    switch (method) {
      case 'DELETE':
        return `return await $repos.main.delete($params.id);`;
      case 'POST':
        return `return await $repos.main.create($body);`;
      case 'PATCH':
        return `return await $repos.main.update($params.id, $body);`;
      default:
        return `return await $repos.main.find();`;
    }
  }
}
