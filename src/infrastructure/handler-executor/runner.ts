import {
  buildCallableFunctionProxy,
  buildFunctionProxy,
} from './utils/build-fn-proxy';

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

export const pendingCalls = new Map();

process.on('unhandledRejection', (reason: any) => {
  process.send({
    type: 'error',
    error: {
      message:
        reason?.errorResponse?.message ??
        (reason instanceof Error ? reason.message : String(reason)),
      stack: reason?.errorResponse?.stack,
      name: reason?.errorResponse?.name,
      statusCode: reason?.errorResponse?.statusCode,
    },
  });
});

process.on('message', async (msg: any) => {
  if (msg.type === 'call_result') {
    const { callId, result, error, ...others } = msg;
    const resolver = pendingCalls.get(callId);
    if (resolver) {
      pendingCalls.delete(callId);
      if (error) {
        resolver.reject({ ...error, ...others });
      } else {
        resolver.resolve(result);
      }
    }
  }
  if (msg.type === 'execute') {
    const originalRepos = msg.ctx.$repos || {};

    const ctx = msg.ctx;
    ctx.$repos = {};

    for (const serviceName of Object.keys(originalRepos)) {
      ctx.$repos[serviceName] = buildFunctionProxy(`$repos.${serviceName}`);
    }
    ctx.$errors = buildFunctionProxy('$errors');
    ctx.$helpers = buildFunctionProxy('$helpers');
    ctx.$logs = buildCallableFunctionProxy('$logs');
    try {
      const asyncFn = new AsyncFunction(
        '$ctx',
        `
          "use strict";
          return (async () => {
            ${msg.code}
          })();
        `
      );
      const result = await asyncFn(ctx);

      process.send({
        type: 'done',
        data: result,
        ctx,
      });
    } catch (error) {
      console.log(error instanceof Error ? error.message : String(error));
      const errorObj = error as any;
      process.send({
        type: 'error',
        error: {
          message:
            errorObj?.errorResponse?.message ??
            (error instanceof Error ? error.message : String(error)),
          stack: errorObj?.errorResponse?.stack,
          name: errorObj?.errorResponse?.name,
          statusCode: errorObj?.errorResponse?.statusCode,
        },
      });
    }
  }
});

process.on('error', err => {
  console.log(err);
});
