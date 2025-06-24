export function wrapCtx(
  obj: any,
  path: string[] = [],
  seen = new WeakSet(),
): any {
  if (obj === null || typeof obj !== 'object') {
    if (typeof obj === 'function') {
      return {
        __type: 'function',
        path: path.join('.'),
      };
    }
    return obj;
  }

  if (seen.has(obj)) {
    return '[Circular]';
  }

  seen.add(obj);

  if (Array.isArray(obj)) {
    return obj.map((item, index) =>
      wrapCtx(item, [...path, String(index)], seen),
    );
  }

  const wrapped: any = {};

  for (const key of Object.keys(obj)) {
    const val = obj[key];

    // SPECIAL CASE: $repos → chỉ giữ tên
    if (key === '$repos') {
      wrapped[key] = {};
      const serviceNames = Object.keys(val);
      for (const serviceName of serviceNames) {
        wrapped[key][serviceName] = {}; // chỉ cần giữ tên
      }
      continue;
    }

    // SPECIAL CASE: $req
    if (key === '$req') {
      wrapped[key] = {
        method: val.method,
        url: val.url,
        ip:
          val.ip ||
          val.headers?.['x-forwarded-for'] ||
          val.socket?.remoteAddress,
        headers: {
          authorization: val.headers?.['authorization'],
          'user-agent': val.headers?.['user-agent'],
        },
      };
      continue;
    }

    // SPECIAL CASE: $headers
    if (key === '$headers') {
      wrapped[key] = {
        authorization: val['authorization'],
        'user-agent': val['user-agent'],
      };
      continue;
    }

    // NORMAL FUNCTION → wrap path
    if (typeof val === 'function') {
      wrapped[key] = {
        __type: 'function',
        path: [...path, key].join('.'),
      };
      continue;
    }

    // NORMAL OBJECT → wrap tiếp
    wrapped[key] = wrapCtx(val, [...path, key], seen);
  }

  return wrapped;
}
