import { pendingCalls } from '../runner';

let callCounter = 1;

export function buildFunctionProxy(prefixPath) {
  return new Proxy(
    {},
    {
      get(target, methodName) {
        const callId = `call_${++callCounter}`;
        return async (...args) => {
          process.send({
            type: 'call',
            callId,
            path: `${prefixPath}.${String(methodName)}`,
            args,
          });
          return await waitForParentResponse(callId);
        };
      },
    },
  );
}

function waitForParentResponse(callId) {
  return new Promise((resolve, reject) => {
    pendingCalls.set(callId, { resolve, reject });
  });
}
