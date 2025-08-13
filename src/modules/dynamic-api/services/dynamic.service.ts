// External packages
import { Request } from 'express';

// @nestjs packages
import { Injectable, Logger } from '@nestjs/common';

// Internal imports
import {
  ResourceNotFoundException,
  ScriptExecutionException,
  ScriptTimeoutException,
} from '../../../core/exceptions/custom-exceptions';
import { LoggingService } from '../../../core/exceptions/services/logging.service';
import { HandlerExecutorService } from '../../../infrastructure/handler-executor/services/handler-executor.service';
import { TDynamicContext } from '../../../shared/utils/types/dynamic-context.type';

@Injectable()
export class DynamicService {
  private logger = new Logger(DynamicService.name);

  constructor(
    private handlerExecutorService: HandlerExecutorService,
    private loggingService: LoggingService,
  ) {}

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
    // Calculate timeout outside try block so it's available in catch
    const isTableDefinitionOperation =
      req.routeData.mainTable?.name === 'table_definition' ||
      req.routeData.targetTables?.some(
        (table) => table.name === 'table_definition',
      );
    const timeout = isTableDefinitionOperation ? 30000 : 10000;

    try {
      const userHandler = req.routeData.handler?.trim();
      const defaultHandler = this.getDefaultHandler(req.method);

      if (!userHandler && !defaultHandler) {
        throw new ResourceNotFoundException('Handler', req.method);
      }

      const scriptCode = userHandler || defaultHandler;

      const result = await this.handlerExecutorService.run(
        scriptCode,
        req.routeData.context,
        timeout,
      );

      return result;
    } catch (error) {
      this.loggingService.error('Handler execution failed', {
        context: 'runHandler',
        error: error.message,
        stack: error.stack,
        method: req.method,
        url: req.url,
        handler: req.routeData?.handler,
        isTableOperation: isTableDefinitionOperation,
        timeout: timeout,
        userId: req.user?.id,
      });

      // Re-throw custom exceptions as-is (they already have proper error codes)
      if (error.constructor.name.includes('Exception')) {
        throw error;
      }

      // Handle timeout errors specifically
      if (error.message === 'Timeout') {
        throw new ScriptTimeoutException(timeout, req.routeData?.handler);
      }

      // Handle other script errors
      throw new ScriptExecutionException(
        error.message,
        req.routeData?.handler,
        {
          method: req.method,
          url: req.url,
          userId: req.user?.id,
          isTableOperation: isTableDefinitionOperation,
        },
      );
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
