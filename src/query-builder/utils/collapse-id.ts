export function collapseIdOnlyFields(
  obj: any,
  requestedFields: Set<string>,
  parentPath = '',
): any {
  if (obj instanceof Date) return obj;

  if (Array.isArray(obj)) {
    const collapsed = obj.map((item) =>
      collapseIdOnlyFields(item, requestedFields, parentPath),
    );

    const isAllIdObjects = collapsed.every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        !Array.isArray(item) &&
        Object.keys(item).length === 1 &&
        (typeof item.id === 'number' || typeof item.id === 'string'),
    );

    const idFieldPath = parentPath ? `${parentPath}.id` : 'id';
    const shouldCollapse =
      !requestedFields.has(idFieldPath) &&
      !requestedFields.has(`${parentPath}.*`);

    return isAllIdObjects && shouldCollapse
      ? collapsed.map((item) => item.id)
      : collapsed;
  }

  if (obj !== null && typeof obj === 'object' && !Array.isArray(obj)) {
    const keys = Object.keys(obj);
    const idFieldPath = parentPath ? `${parentPath}.id` : 'id';

    const shouldCollapse =
      keys.length === 1 &&
      keys[0] === 'id' &&
      (typeof obj.id === 'string' || typeof obj.id === 'number') &&
      !requestedFields.has(idFieldPath) &&
      !requestedFields.has(`${parentPath}.*`);

    if (shouldCollapse) {
      return obj.id;
    }

    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      const newPath = parentPath ? `${parentPath}.${key}` : key;
      result[key] = collapseIdOnlyFields(value, requestedFields, newPath);
    }
    return result;
  }

  return obj;
}
