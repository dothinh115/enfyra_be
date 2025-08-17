import { SourceFile } from 'ts-morph';

export function wrapEntityClass({
  sourceFile,
  className,
  tableName,
  uniques = [],
  indexes = [],
  usedImports,
  columnsWithUnique = [],
  columnsWithIndex = [],
  validEntityFields = [],
}: {
  sourceFile: SourceFile;
  className: string;
  tableName: string;
  uniques?: Array<{value: string[]}>;
  indexes?: Array<{value: string[]}>;
  usedImports: Set<string>;
  columnsWithUnique?: string[];
  columnsWithIndex?: string[];
  validEntityFields?: string[];
}) {
  const decorators: { name: string; arguments: string[] }[] = [];

  // @Entity('table_name')
  decorators.push({ name: 'Entity', arguments: [`'${tableName}'`] });
  usedImports.add('Entity');

  // Create sets to track column-level constraints (filter out invalid values)
  const validColumnsWithUnique = (columnsWithUnique || []).filter(col => col && typeof col === 'string' && col.trim().length > 0);
  const validColumnsWithIndex = (columnsWithIndex || []).filter(col => col && typeof col === 'string' && col.trim().length > 0);
  
  const columnsWithUniqueSet = new Set(validColumnsWithUnique);
  const columnsWithIndexSet = new Set(validColumnsWithIndex);
  
  // Create set of all valid entity fields (including system fields)
  const allValidFields = new Set([
    ...validEntityFields,
    'id', 'createdAt', 'updatedAt' // Always include system fields
  ]);
  
  // Create sets to track what we've already added
  const addedUniqueKeys = new Set<string>();
  const addedIndexKeys = new Set<string>();

  for (const unique of uniques || []) {
    // Handle null/undefined unique.value
    if (!unique || !unique.value || !Array.isArray(unique.value) || unique.value.length === 0) {
      console.warn(`Skipping invalid @Unique constraint - value is not a valid array:`, unique);
      continue;
    }
    
    // Filter out invalid fields BEFORE sorting
    const validFields = unique.value.filter(f => f && typeof f === 'string' && f.trim().length > 0);
    if (validFields.length === 0) {
      console.warn(`Skipping @Unique constraint - no valid fields found:`, unique.value);
      continue;
    }
    
    const fields = validFields.slice().sort(); // Work with valid fields only
    
    // Validate that ALL fields exist in the entity
    const allFieldsExist = fields.every(field => allValidFields.has(field));
    if (!allFieldsExist) {
      const missingFields = fields.filter(field => !allValidFields.has(field));
      console.warn(`Skipping @Unique constraint [${fields.join(', ')}] - missing fields: [${missingFields.join(', ')}]`);
      continue;
    }
    
    const key = fields.join('|');
    
    // Skip if this is a single column that already has unique: true
    const isSingleColumn = fields.length === 1;
    const conflictsWithColumnUnique = isSingleColumn && columnsWithUniqueSet.has(fields[0]);
    
    if (!conflictsWithColumnUnique && !addedUniqueKeys.has(key)) {
      decorators.push({
        name: 'Unique',
        arguments: [`[${fields.map((f) => `'${f}'`).join(', ')}]`],
      });
      usedImports.add('Unique');
      addedUniqueKeys.add(key);
      // Unique constraints also act as indexes
      addedIndexKeys.add(key);
    }
  }

  for (const index of indexes || []) {
    // Handle null/undefined index.value
    if (!index || !index.value || !Array.isArray(index.value) || index.value.length === 0) {
      console.warn(`Skipping invalid @Index constraint - value is not a valid array:`, index);
      continue;
    }
    
    // Filter out invalid fields BEFORE sorting
    const validFields = index.value.filter(f => f && typeof f === 'string' && f.trim().length > 0);
    if (validFields.length === 0) {
      console.warn(`Skipping @Index constraint - no valid fields found:`, index.value);
      continue;
    }
    
    const fields = validFields.slice().sort(); // Work with valid fields only
    
    // Validate that ALL fields exist in the entity
    const allFieldsExist = fields.every(field => allValidFields.has(field));
    if (!allFieldsExist) {
      const missingFields = fields.filter(field => !allValidFields.has(field));
      console.warn(`Skipping @Index constraint [${fields.join(', ')}] - missing fields: [${missingFields.join(', ')}]`);
      continue;
    }
    
    const key = fields.join('|');
    
    // Skip if this is a single column that already has unique: true or index: true
    const isSingleColumn = fields.length === 1;
    const conflictsWithColumnUnique = isSingleColumn && columnsWithUniqueSet.has(fields[0]);
    const conflictsWithColumnIndex = isSingleColumn && columnsWithIndexSet.has(fields[0]);
    
    if (!conflictsWithColumnUnique && !conflictsWithColumnIndex && !addedIndexKeys.has(key)) {
      decorators.push({
        name: 'Index',
        arguments: [`[${fields.map((f) => `'${f}'`).join(', ')}]`],
      });
      usedImports.add('Index');
      addedIndexKeys.add(key);
    }
  }

  return sourceFile.addClass({
    name: className,
    isExported: true,
    decorators,
  });
}
