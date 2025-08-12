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
}: {
  sourceFile: SourceFile;
  className: string;
  tableName: string;
  uniques?: CreateUniqueDto[];
  indexes?: CreateIndexDto[];
  usedImports: Set<string>;
}) {
  const decorators: { name: string; arguments: string[] }[] = [];

  // @Entity('table_name')
  decorators.push({ name: 'Entity', arguments: [`'${tableName}'`] });
  usedImports.add('Entity');

  const uniqueKeySet = new Set(
    (uniques || []).map((u) => (Array.isArray(u) ? u : [u]).sort().join('|')),
  );

  for (const unique of uniques || []) {
    const fields = Array.isArray(unique) ? unique : [unique];
    decorators.push({
      name: 'Unique',
      arguments: [`[${fields.map((f) => `'${f}'`).join(', ')}]`],
    });
    usedImports.add('Unique');
  }

  for (const index of indexes || []) {
    const fields = Array.isArray(index) ? index : [index];
    const key = fields.sort().join('|');
    if (!uniqueKeySet.has(key)) {
      decorators.push({
        name: 'Index',
        arguments: [`[${fields.map((f) => `'${f}'`).join(', ')}]`],
      });
      usedImports.add('Index');
    }
  }

  return sourceFile.addClass({
    name: className,
    isExported: true,
    decorators,
  });
}
