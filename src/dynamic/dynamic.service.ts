import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Request } from 'express';
import { TDynamicContext } from '../utils/types/dynamic-context.type';
import { HandlerExecutorService } from '../handler-executor/handler-executor.service';

@Injectable()
export class DynamicService {
  private logger = new Logger(DynamicService.name);

  constructor(private handlerExecutorService: HandlerExecutorService) {}

  async runHandler(
    req: Request & {
      routeData: any & {
        params: any;
        handler: string;
        context: TDynamicContext;
      };
      user: any;
    },
  ) {
    try {
      const userHandler = req.routeData.handler?.trim();
      const defaultHandler = this.getDefaultHandler(req.method);

      if (!userHandler && !defaultHandler) {
        throw new BadRequestException('Không có handler tương ứng');
      }

      const scriptCode = userHandler || defaultHandler;
      const result = await this.handlerExecutorService.run(
        scriptCode,
        req.routeData.context,
        15000,
      );

      return result;
    } catch (error) {
      this.logger.error('❌ Lỗi khi chạy handler:', error.message);
      this.logger.debug(error.stack);

      throw new BadRequestException(`Script error: ${error.message}`);
    }
  }

  private getDefaultHandler(method: string): string {
    switch (method) {
      case 'DELETE':
        return `return await $ctx.$repos.main.delete($ctx.$params.id);`;
      case 'POST':
        return `return await $ctx.$repos.main.create($ctx.$body);`;
      case 'PATCH':
        return `return await $ctx.$repos.main.update($ctx.$params.id, $ctx.$body);`;
      default:
        return `return await $ctx.$repos.main.find();`;
    }
  }
}
