import { pendingCalls } from '../runner';

let callCounter = 1;
export function buildFunctionProxy(prefixPath: string): any {
  return new Proxy(function () {}, {
    get(_, prop: string | symbol) {
      // Bỏ qua những property đặc biệt khi debug/log
      if (
        prop === 'toJSON' ||
        prop === 'inspect' ||
        prop === Symbol.toPrimitive ||
        prop === Symbol.toStringTag
      ) {
        return () => `[FunctionProxy: ${prefixPath}]`;
      }

      // Cho phép gọi nested như $helpers.$bcrypt.hash
      const newPath = `${prefixPath}.${String(prop)}`;
      return buildFunctionProxy(newPath);
    },

    apply(_, __, args: any[]) {
      const callId = `call_${++callCounter}`;
      process.send?.({
        type: 'call',
        callId,
        path: prefixPath,
        args,
      });
      return waitForParentResponse(callId);
    },
  });
}

export function buildCallableFunctionProxy(path: string) {
  return async (...args: any[]) => {
    const callId = `call_${++callCounter}`;
    process.send?.({
      type: 'call',
      callId,
      path,
      args,
    });
    return await waitForParentResponse(callId);
  };
}

/**
 * Chờ phản hồi từ parent process
 */
function waitForParentResponse(callId: string): Promise<any> {
  return new Promise((resolve, reject) => {
    pendingCalls.set(callId, { resolve, reject });
  });
}
