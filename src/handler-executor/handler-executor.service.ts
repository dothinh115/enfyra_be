import {
  TDynamicContext,
  TGqlDynamicContext,
} from '../utils/types/dynamic-context.type';
import { wrapCtx } from './utils/wrap-ctx';
import { resolvePath } from './utils/resolve-path';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ExecutorPoolService } from './executor-pool.service';

@Injectable()
export class HandlerExecutorService {
  constructor(private executorPoolService: ExecutorPoolService) {}
  async run(
    code: string,
    ctx: TDynamicContext | TGqlDynamicContext,
    timeoutMs = 5000,
  ): Promise<any> {
    const pool = this.executorPoolService.getPool();

    return new Promise(async (resolve, reject) => {
      const child = await pool.acquire();
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error('Timeout'));
      }, timeoutMs);
      child.on('message', async (msg: any) => {
        if (msg.type === 'call') {
          try {
            const { parent, method } = resolvePath(ctx, msg.path);

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
              ...err.response,
            });
          }
        }
        if (msg.type === 'done') {
          for (const key of Object.keys(msg.ctx)) {
            ctx[key] = msg.ctx[key];
          }
          clearTimeout(timeout);
          child.kill();
          resolve(msg.data);
        }
        if (msg.type === 'error') {
          let error = new InternalServerErrorException(msg.error.message);
          if (msg.error.statusCode === 400)
            error = new BadRequestException(msg.error.message);
          else if (msg.error.statusCode === 401)
            error = new UnauthorizedException();
          else if (msg.error.statusCode === 403)
            error = new ForbiddenException();
          reject(error);
        }
      });

      child.send({
        type: 'execute',
        ctx: wrapCtx(ctx),
        code,
      });
    });
  }
}
