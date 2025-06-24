import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
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
    const logs: any[] = [];
    const timeoutMs = 3000;

    req.routeData.context.$logs = (...args: any[]) => {
      logs.push(...args);
    };

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
      );

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

      throw new BadRequestException(`Script error: ${error.message}`);
    }
  }

  private getDefaultHandler(method: string): string {
    switch (method) {
      case 'DELETE':
        return `return await $ctx.$repos.main.delete($params.id);`;
      case 'POST':
        return `return await $ctx.$repos.main.create($body);`;
      case 'PATCH':
        return `return await $ctx.$repos.main.update($params.id, $body);`;
      default:
        return `return await $ctx.$repos.main.find();`;
    }
  }
}
