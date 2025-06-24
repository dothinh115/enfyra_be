export function resolvePath(obj, path) {
  const parts = path.split('.');
  const method = parts.pop();
  let parent = obj;
  for (const part of parts) {
    if (parent && part in parent) {
      parent = parent[part];
    } else {
      throw new Error(`Invalid path: ${path}`);
    }
  }
  if (!parent || typeof parent[method] !== 'function') {
    throw new Error(`Path ${path} is not a function`);
  }
  return { parent, method };
}
