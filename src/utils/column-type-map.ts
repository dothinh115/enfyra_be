const ColumnTypeMap = {
  INT: 'number',
  VARCHAR: 'string',
  BOOLEAN: 'boolean',
  TEXT: 'string',
  DATE: 'date',
  FLOAT: 'float',
  JSON: 'json',
} as const;

type ColumnTypeKey = keyof typeof ColumnTypeMap; // 'INT' | 'VARCHAR' | ...
type ColumnTypeValue = (typeof ColumnTypeMap)[ColumnTypeKey]; // 'number' | 'string' | ...

// Hàm chuyển key DB -> value JS
export function toJsType(dbType: string): ColumnTypeValue | undefined {
  // Chuyển thành viết hoa để tìm key chính xác
  const key = dbType.toUpperCase() as ColumnTypeKey;
  return ColumnTypeMap[key];
}

// Hàm chuyển ngược value JS -> key DB đầu tiên tìm được
export function toDbType(jsType: ColumnTypeValue): ColumnTypeKey | undefined {
  const entries = Object.entries(ColumnTypeMap) as [
    ColumnTypeKey,
    ColumnTypeValue,
  ][];
  const entry = entries.find(([_, v]) => v === jsType);
  return entry ? entry[0] : undefined;
}
