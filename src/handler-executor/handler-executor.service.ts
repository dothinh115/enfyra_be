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
    let isDone = false;
    return new Promise(async (resolve, reject) => {
      const child = await pool.acquire();
      const timeout = setTimeout(async () => {
        child.removeAllListeners();
        await pool.release(child);
        reject(new Error('Timeout'));
      }, timeoutMs);

      child.on('message', async (msg: any) => {
        if (isDone) return;
        if (msg.type === 'call') {
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
          for (const key of Object.keys(msg.ctx)) {
            ctx[key] = msg.ctx[key];
          }
          clearTimeout(timeout);
          await pool.release(child);
          resolve(msg.data);
        }
        if (msg.type === 'error') {
          isDone = true;
          child.removeAllListeners();
          let error = new InternalServerErrorException(msg.error.message);
          if (msg.error.statusCode === 400)
            error = new BadRequestException(msg.error.message);
          else if (msg.error.statusCode === 401)
            error = new UnauthorizedException();
          else if (msg.error.statusCode === 403)
            error = new ForbiddenException();
          clearTimeout(timeout);
          await pool.release(child);

          reject(error);
        }
      });

      child.once('exit', async (code, signal) => {
        if (isDone) return;
        isDone = true;
        child.removeAllListeners();
        clearTimeout(timeout);
        await pool.release(child);
        reject(
          new InternalServerErrorException(
            `Child process exited with code ${code}, signal ${signal}`,
          ),
        );
      });

      child.once('error', async (err) => {
        if (isDone) return;
        isDone = true;
        child.removeAllListeners();
        clearTimeout(timeout);
        await pool.release(child);
        reject(
          new InternalServerErrorException(
            `Child process error: ${err?.message || err}`,
          ),
        );
      });

      child.send({
        type: 'execute',
        ctx: wrapCtx(ctx),
        code,
      });
    });
  }
}
