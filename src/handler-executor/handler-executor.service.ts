import { Injectable, Logger } from '@nestjs/common';
import { fork } from 'child_process';
import { join } from 'path';

@Injectable()
export class HandlerExecutorService {
  private readonly logger = new Logger(HandlerExecutorService.name);

  async runHandler(code: string, ctx: any, timeoutMs = 5000): Promise<any> {
    return new Promise((resolve, reject) => {
      const child = fork(join(__dirname, 'runner.js'));

      const dynamicFindMap = ctx.$repos;
      const repoNames = Object.keys(dynamicFindMap);

      const safeCtx = {
        ...ctx,
        $req: {},
        $repos: repoNames,
      };

      const timer = setTimeout(() => {
        this.logger.error(`Handler timeout after ${timeoutMs}ms`);
        child.kill();
        reject(new Error('Handler timeout'));
      }, timeoutMs);

      child.on('message', async (message: any) => {
        if (message.type === 'RESULT') {
          clearTimeout(timer);
          resolve(message.result);
          child.kill();
        } else if (message.type === 'ERROR') {
          clearTimeout(timer);
          this.logger.error(`Handler error: ${message.error}`);
          reject(new Error(message.error));
          child.kill();
        } else if (message.type === 'CALL') {
          const { repo, method, params, callId } = message;
          try {
            const result = await dynamicFindMap[repo][method](...params);
            child.send({ type: 'CALL_RESULT', callId, result });
          } catch (err) {
            child.send({ type: 'CALL_ERROR', callId, error: err.message });
          }
        }
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        this.logger.error(`Handler process error: ${err.message}`);
        reject(err);
      });
      console.log('🔥 HandlerExecutorService running script:', code);
      console.log('🔥 handlerCtx:', safeCtx);
      child.send({ type: 'RUN', code, ctx: safeCtx });
    });
  }
}
