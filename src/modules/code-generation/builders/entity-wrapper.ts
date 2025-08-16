import { SourceFile } from 'ts-morph';
import {
  CreateIndexDto,
  CreateUniqueDto,
} from '../../table-management/dto/create-table.dto';

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
  uniques?: CreateUniqueDto[];
  indexes?: CreateIndexDto[];
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
    const fields = unique.value.slice().sort(); // Don't mutate original
    
    // Skip empty arrays or arrays with null/undefined values
    const validFields = fields.filter(f => f && typeof f === 'string' && f.trim().length > 0);
    if (validFields.length === 0) continue;
    
    // Validate that ALL fields exist in the entity
    const allFieldsExist = validFields.every(field => allValidFields.has(field));
    if (!allFieldsExist) {
      console.warn(`Skipping @Unique constraint [${validFields.join(', ')}] - contains non-existent fields`);
      continue;
    }
    
    const key = validFields.join('|');
    
    // Skip if this is a single column that already has unique: true
    const isSingleColumn = validFields.length === 1;
    // Check both original and sanitized field names for conflicts
    const originalField = isSingleColumn ? fields.filter(f => f && typeof f === 'string' && f.trim().length > 0)[0] : null;
    const conflictsWithColumnUnique = isSingleColumn && (
      columnsWithUniqueSet.has(validFields[0]) || 
      (originalField && columnsWithUniqueSet.has(originalField))
    );
    
    if (!conflictsWithColumnUnique && !addedUniqueKeys.has(key)) {
      // Sanitize field names for TypeScript syntax
      const sanitizedFields = validFields.map(f => f.replace(/['"\\]/g, '_'));
      
      decorators.push({
        name: 'Unique',
        arguments: [`[${sanitizedFields.map((f) => `'${f}'`).join(', ')}]`],
      });
      usedImports.add('Unique');
      addedUniqueKeys.add(key);
      // Unique constraints also act as indexes
      addedIndexKeys.add(key);
    }
  }

  for (const index of indexes || []) {
    const fields = index.value.slice().sort(); // Don't mutate original
    
    // Skip empty arrays or arrays with null/undefined values
    const validFields = fields.filter(f => f && typeof f === 'string' && f.trim().length > 0);
    if (validFields.length === 0) continue;
    
    // Validate that ALL fields exist in the entity
    const allFieldsExist = validFields.every(field => allValidFields.has(field));
    if (!allFieldsExist) {
      console.warn(`Skipping @Index constraint [${validFields.join(', ')}] - contains non-existent fields`);
      continue;
    }
    
    const key = validFields.join('|');
    
    // Skip if this is a single column that already has unique: true or index: true
    const isSingleColumn = validFields.length === 1;
    // Check both original and sanitized field names for conflicts
    const originalField = isSingleColumn ? fields.filter(f => f && typeof f === 'string' && f.trim().length > 0)[0] : null;
    const conflictsWithColumnUnique = isSingleColumn && (
      columnsWithUniqueSet.has(validFields[0]) || 
      (originalField && columnsWithUniqueSet.has(originalField))
    );
    const conflictsWithColumnIndex = isSingleColumn && (
      columnsWithIndexSet.has(validFields[0]) || 
      (originalField && columnsWithIndexSet.has(originalField))
    );
    
    if (!conflictsWithColumnUnique && !conflictsWithColumnIndex && !addedIndexKeys.has(key)) {
      // Sanitize field names for TypeScript syntax
      const sanitizedFields = validFields.map(f => f.replace(/['"\\]/g, '_'));
      
      decorators.push({
        name: 'Index',
        arguments: [`[${sanitizedFields.map((f) => `'${f}'`).join(', ')}]`],
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
