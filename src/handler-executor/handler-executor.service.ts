import { TDynamicContext } from '../utils/types/dynamic-context.type';
import { wrapCtx } from './utils/wrap-ctx';
import { resolvePath } from './utils/resolve-path';
import { Injectable, Logger } from '@nestjs/common';
import { ExecutorPoolService } from './executor-pool.service';
import { merge } from 'lodash';
import {
  ScriptTimeoutException,
  ScriptExecutionException,
  AuthenticationException,
  AuthorizationException,
  BusinessLogicException,
} from '../exceptions/custom-exceptions';

@Injectable()
export class HandlerExecutorService {
  private readonly logger = new Logger(HandlerExecutorService.name);

  constructor(private executorPoolService: ExecutorPoolService) {}

  private createException(
    errorPath?: string,
    statusCode?: number,
    message?: string,
    code?: string,
    details?: any,
  ): any {
    // Handle $errors calls from child process
    if (errorPath?.includes('$errors')) {
      switch (errorPath) {
        case '$errors.throw400':
          return new BusinessLogicException(message || 'Bad request');
        case '$errors.throw401':
          return new AuthenticationException(
            message || 'Authentication required',
          );
        case '$errors.throw403':
          return new AuthorizationException(
            message || 'Insufficient permissions',
          );
        default:
          return new ScriptExecutionException(message || 'Unknown error', code);
      }
    }

    // Handle status code based errors
    if (statusCode) {
      switch (statusCode) {
        case 400:
          return new BusinessLogicException(message || 'Bad request');
        case 401:
          return new AuthenticationException(
            message || 'Authentication required',
          );
        case 403:
          return new AuthorizationException(
            message || 'Insufficient permissions',
          );
        default:
          return new ScriptExecutionException(
            message || 'Unknown error',
            code,
            details,
          );
      }
    }

    // Default fallback
    return new ScriptExecutionException(
      message || 'Unknown error',
      code,
      details,
    );
  }

  /**
   * Log error with consistent format
   */
  private logError(
    errorType: string,
    message: string,
    code: string,
    additionalData?: any,
  ): void {
    this.logger.error(`Handler Executor ${errorType}`, {
      message,
      code: code.substring(0, 100), // Log first 100 chars of script
      ...additionalData,
    });
  }

  /**
   * Handle child process error with cleanup
   */
  private handleChildError(
    isDone: boolean,
    child: any,
    timeout: NodeJS.Timeout,
    pool: any,
    error: any,
    errorType: string,
    message: string,
    code: string,
    reject: (error: any) => void,
    additionalData?: any,
  ): boolean {
    if (isDone) return true;

    child.removeAllListeners();
    clearTimeout(timeout);
    pool.release(child);

    this.logError(errorType, message, code, additionalData);
    reject(error);
    return true;
  }
  async run(
    code: string,
    ctx: TDynamicContext,
    timeoutMs = 5000,
  ): Promise<any> {
    const pool = this.executorPoolService.getPool();
    let isDone = false;
    return new Promise(async (resolve, reject) => {
      const child = await pool.acquire();
      const timeout = setTimeout(async () => {
        if (isDone) return;
        isDone = true;
        child.removeAllListeners();
        try {
          await child.kill();
        } catch (e) {
          this.logger.warn('Failed to kill child on timeout', e);
        }
        reject(new ScriptTimeoutException(timeoutMs, code));
      }, timeoutMs);

      child.on('message', async (msg: any) => {
        if (isDone) return;
        if (msg.type === 'call') {
          if (msg.path.includes('$errors')) {
            const error = this.createException(
              msg.path,
              undefined,
              msg.args[0],
              code,
            );
            reject(error);
          }
          try {
            const { parent, method } = resolvePath(ctx, msg.path);

            if (typeof parent[method] !== 'function') return;
            const result = await parent[method](...msg.args);
            child.send({
              type: 'call_result',
              callId: msg.callId,
              result,
            });
          } catch (err) {
            child.send({
              type: 'call_result',
              callId: msg.callId,
              error: true,
              errorResponse: err.response,
            });
          }
        }
        if (msg.type === 'done') {
          isDone = true;
          child.removeAllListeners();

          // SMART MERGE CONTEXT - ONLY MERGE SIMPLE OBJECTS
          if (msg.ctx) {
            const mergedCtx = this.smartMergeContext(ctx, msg.ctx);
            // Update the original context with merged changes
            Object.assign(ctx, mergedCtx);
          }

          clearTimeout(timeout);
          await pool.release(child);
          resolve(msg.data);
        }
        if (msg.type === 'error') {
          const error = this.createException(
            undefined,
            msg.error.statusCode,
            msg.error.message,
            code,
            {
              statusCode: msg.error.statusCode,
              stack: msg.error.stack,
            },
          );

          isDone = this.handleChildError(
            isDone,
            child,
            timeout,
            pool,
            error,
            'Child Process Error',
            msg.error.message,
            code,
            reject,
            {
              statusCode: msg.error.statusCode,
              stack: msg.error.stack,
            },
          );
        }
      });

      child.once('exit', async (exitCode, signal) => {
        const error = new ScriptExecutionException(
          `Child process exited with code ${exitCode}, signal ${signal}`,
          code,
          { exitCode, signal },
        );

        isDone = this.handleChildError(
          isDone,
          child,
          timeout,
          pool,
          error,
          'Child Process Exit',
          `Child process exited with code ${exitCode}, signal ${signal}`,
          code,
          reject,
          { exitCode, signal },
        );
      });

      child.once('error', async (err) => {
        const error = new ScriptExecutionException(
          `Child process error: ${err?.message || err}`,
          code,
          { originalError: err },
        );

        isDone = this.handleChildError(
          isDone,
          child,
          timeout,
          pool,
          error,
          'Child Process Error',
          err?.message || err,
          code,
          reject,
          { originalError: err },
        );
      });

      child.send({
        type: 'execute',
        ctx: wrapCtx(ctx),
        code,
      });
    });
  }

  // SMART MERGE CONTEXT - ONLY MERGE SIMPLE OBJECTS
  private smartMergeContext(
    originalCtx: TDynamicContext,
    childCtx: any,
  ): TDynamicContext {
    const mergedCtx = { ...originalCtx };

    // SPECIFY OBJECTS THAT SHOULD NOT BE MERGED
    const nonMergeableProperties = [
      '$repos', // Repository functions
      '$logs', // Log function
      '$helpers', // Helper functions
      '$user', // User object (complex)
      '$req', // Request object (complex)
      '$errors', // Errors object
    ];

    // MERGE ALL PROPERTIES EXCEPT NON-MERGEABLE ONES
    for (const key in childCtx) {
      if (!nonMergeableProperties.includes(key)) {
        const value = childCtx[key];

        // MERGE PRIMITIVES DIRECTLY (but not null/undefined)
        if (this.isPrimitive(value) && value !== null && value !== undefined) {
          mergedCtx[key] = value;
        }
        // MERGE OBJECTS IF MERGEABLE
        else if (this.isMergeableProperty(value)) {
          mergedCtx[key] = merge({}, mergedCtx[key] || {}, value);
        }
      }
    }

    return mergedCtx;
  }

  // CHECK IF PROPERTY IS MERGEABLE - ACCURATE
  private isMergeableProperty(value: any): boolean {
    return (
      value !== null &&
      value !== undefined &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      !(value instanceof Date) &&
      !(value instanceof Function) &&
      // DO NOT MERGE OBJECTS CONTAINING FUNCTIONS, ARRAYS, OR DATES
      !this.containsFunctions(value) &&
      !this.containsArrays(value) &&
      !this.containsDates(value)
    );
  }

  // CHECK IF VALUE IS PRIMITIVE
  private isPrimitive(value: any): boolean {
    return (
      value === null ||
      value === undefined ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'symbol'
    );
  }

  // CHECK IF OBJECT CONTAINS FUNCTIONS
  private containsFunctions(obj: any): boolean {
    if (typeof obj !== 'object' || obj === null) return false;

    for (const key in obj) {
      const value = obj[key];
      if (typeof value === 'function') return true;
      if (
        typeof value === 'object' &&
        value !== null &&
        this.containsFunctions(value)
      )
        return true;
    }

    return false;
  }

  // CHECK IF OBJECT CONTAINS ARRAYS
  private containsArrays(obj: any): boolean {
    if (typeof obj !== 'object' || obj === null) return false;

    for (const key in obj) {
      const value = obj[key];
      if (Array.isArray(value)) return true;
      if (
        typeof value === 'object' &&
        value !== null &&
        this.containsArrays(value)
      )
        return true;
    }

    return false;
  }

  // CHECK IF OBJECT CONTAINS DATES
  private containsDates(obj: any): boolean {
    if (typeof obj !== 'object' || obj === null) return false;

    for (const key in obj) {
      const value = obj[key];
      if (value instanceof Date) return true;
      if (
        typeof value === 'object' &&
        value !== null &&
        this.containsDates(value)
      )
        return true;
    }

    return false;
  }
}
