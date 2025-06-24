import { buildFunctionProxy } from './utils/build-fn-proxy';

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

export const pendingCalls = new Map();

process.on('message', async (msg: any) => {
  if (msg.type === 'call_result') {
    const { callId, result, error, ...others } = msg;
    const resolver = pendingCalls.get(callId);
    if (resolver) {
      pendingCalls.delete(callId);
      if (error) {
        resolver.reject({ ...error, ...others });
      } else resolver.resolve(result);
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

    try {
      const asyncFn = new AsyncFunction(
        '$ctx',
        `
          "use strict";
          return (async () => {
            ${msg.code}
          })();
        `,
      );
      const result = await asyncFn(ctx);
      process.send({
        type: 'done',
        data: result,
      });
    } catch (error) {
      process.send({
        type: 'error',
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name,
          statusCode: error.statusCode,
        },
      });
    }
  }
});
