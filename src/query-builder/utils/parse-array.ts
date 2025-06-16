export function parseArray(val: any): any[] {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed;
      return val.split(',').map((s) => s.trim());
    } catch {
      return val.split(',').map((s) => s.trim());
    }
  }
  return [val];
}
