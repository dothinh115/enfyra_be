const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

let callCounter = 1;
const pendingCalls = new Map();

process.on('message', async (msg: any) => {
  if (msg.type === 'call_result') {
    const { callId, result, error } = msg;
    const resolver = pendingCalls.get(callId);
    if (resolver) {
      pendingCalls.delete(callId);
      if (error) resolver.reject(new Error(error));
      else resolver.resolve(result);
    }
  }
  if (msg.type === 'execute') {
    const originalRepos = msg.ctx.$repos || {};

    const ctx = msg.ctx;
    ctx.$repos = {};

    for (const serviceName of Object.keys(originalRepos)) {
      ctx.$repos[serviceName] = new Proxy(
        {},
        {
          get(target, methodName) {
            const callId = `call_${++callCounter}`;
            return async (...args) => {
              process.send({
                type: 'call',
                path: `$repos.${serviceName}.${String(methodName)}`,
                args,
                callId,
              });
              return await waitForParentResponse(callId);
            };
          },
        },
      );
    }

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
        error,
      });
    }
  }
});

function waitForParentResponse(callId) {
  return new Promise((resolve, reject) => {
    pendingCalls.set(callId, { resolve, reject });
  });
}
