import { fork } from 'child_process';
import * as path from 'path';
import {
  TDynamicContext,
  TGqlDynamicContext,
} from '../utils/types/dynamic-context.type';
import { wrapCtx } from './utils/wrap-ctx';
import { resolvePath } from './utils/resolve-path';

export class HandlerExecutorService {
  async run(
    code: string,
    ctx: TDynamicContext | TGqlDynamicContext,
    timeoutMs = 5000,
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const child = fork(path.resolve(__dirname, 'runner.js'));

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
              error: err.message,
            });
          }
        }
        if (msg.type === 'done') {
          clearTimeout(timeout);
          child.kill();
          resolve(msg.data);
        }
        if (msg.type === 'error') {
          reject(msg.error);
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
