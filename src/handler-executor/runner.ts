const { v4: uuidv4 } = require('uuid');

const pendingCalls = new Map();

process.on('message', async (message: any) => {
  if (message.type === 'RUN') {
    const { code, ctx } = message;
    console.log('🔥 Runner.js started with ctx:', ctx);

    const AsyncFunction = Object.getPrototypeOf(
      async function () {},
    ).constructor;
    const fn = new AsyncFunction('$repos', code);

    try {
      const $call = (repo, method, ...params) => {
        return new Promise((resolve, reject) => {
          const callId = uuidv4();
          pendingCalls.set(callId, { resolve, reject });
          process.send({
            type: 'CALL',
            repo,
            method,
            params,
            callId,
          });
        });
      };

      const $repos = new Proxy(
        {},
        {
          get(target, repoName) {
            return new Proxy(
              {},
              {
                get(target2, methodName) {
                  return (...params) => $call(repoName, methodName, ...params);
                },
              },
            );
          },
        },
      );

      const result = await fn(ctx, $repos);

      process.send({ type: 'RESULT', result });
    } catch (err) {
      process.send({ type: 'ERROR', error: err.message });
    }
  } else if (message.type === 'CALL_RESULT') {
    const { callId, result } = message;
    const call = pendingCalls.get(callId);
    if (call) {
      call.resolve(result);
      pendingCalls.delete(callId);
    }
  } else if (message.type === 'CALL_ERROR') {
    const { callId, error } = message;
    const call = pendingCalls.get(callId);
    if (call) {
      call.reject(new Error(error));
      pendingCalls.delete(callId);
    }
  }
});
