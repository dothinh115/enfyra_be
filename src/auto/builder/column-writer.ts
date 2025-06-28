import { ClassDeclaration } from 'ts-morph';

interface ColumnWriterContext {
  classDeclaration: ClassDeclaration;
  col: Partial<any>;
  usedImports: Set<string>;
  helpers: {
    capitalize: (s: string) => string;
    dbTypeToTSType: (type: string) => string;
  };
}

export function addColumnToClass({
  classDeclaration,
  col,
  usedImports,
  helpers,
}: ColumnWriterContext): void {
  const decorators: { name: string; arguments: string[] }[] = [];

  if (col.isPrimary) {
    const strategy = col.type === 'uuid' ? `'uuid'` : `'increment'`;
    decorators.push({ name: 'PrimaryGeneratedColumn', arguments: [strategy] });
    usedImports.add('PrimaryGeneratedColumn');
  } else {
    const type = col.type === 'date' ? 'timestamp' : col.type;
    const opts = [`type: "${type}"`];

    if (col.isNullable === false) {
      opts.push('nullable: false');
    } else {
      opts.push('nullable: true');
    }

    if (col.defaultValue !== undefined && col.defaultValue !== null) {
      const invalidDefault =
        (col.type === 'uuid' && col.defaultValue === '') ||
        (col.type === 'number' && isNaN(Number(col.defaultValue)));

      if (invalidDefault) {
      } else if (col.defaultValue === 'now') {
        opts.push(`default: () => "now()"`);
      } else {
        opts.push(
          typeof col.defaultValue === 'string'
            ? `default: "${col.defaultValue}"`
            : `default: ${col.defaultValue}`,
        );
      }
    }

    if (col.isUnique) opts.push('unique: true');
    if (col.type === 'enum' && col.enumValues) {
      opts.push(`enum: [${col.enumValues.map((v) => `'${v}'`).join(', ')}]`);
    }
    if (col.isUpdatable === false) {
      opts.push(`update: false`);
    }

    decorators.push({ name: 'Column', arguments: [`{ ${opts.join(', ')} }`] });
    usedImports.add('Column');

    if (col.isIndex) {
      decorators.push({ name: 'Index', arguments: [] });
      usedImports.add('Index');
    }
  }

  if (col.isHidden) {
    decorators.push({ name: 'HiddenField', arguments: [] });
    usedImports.add('HiddenField');
  }

  const tsType =
    col.type === 'enum'
      ? col.enumValues.map((v) => `'${v}'`).join(' | ')
      : col.type === 'date'
        ? 'Date'
        : helpers.dbTypeToTSType(col.type);

  classDeclaration.addProperty({
    name: col.name,
    type: tsType,
    hasExclamationToken: false,
    decorators,
  });
}
