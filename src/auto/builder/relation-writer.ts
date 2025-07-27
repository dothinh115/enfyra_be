import { ClassDeclaration } from 'ts-morph';

interface RelationWriterContext {
  classDeclaration: ClassDeclaration;
  rel: Partial<Record<string, any>>;
  isInverse?: boolean;
  usedImports: Set<string>;
  usedEntityImports: Set<string>;
  helpers: {
    capitalize: (s: string) => string;
  };
}

export function addRelationToClass({
  classDeclaration,
  rel,
  isInverse = false,
  usedImports,
  usedEntityImports,
  helpers,
}: RelationWriterContext): void {
  const typeMap = {
    'many-to-many': 'ManyToMany',
    'one-to-one': 'OneToOne',
    'many-to-one': 'ManyToOne',
    'one-to-many': 'OneToMany',
  };
  const relationType = typeMap[rel.type] || 'ManyToOne';
  usedImports.add(relationType);

  const target = helpers.capitalize(
    rel.targetTable?.name || rel.targetClass || '',
  );
  if (target && target !== classDeclaration.getName()) {
    usedEntityImports.add(target);
  }

  const decorators = [];

  // Add Index decorator for common FK types
  const shouldAddIndex =
    rel.type === 'many-to-one' || (rel.type === 'one-to-one' && !isInverse);
  if (shouldAddIndex) {
    decorators.push({ name: 'Index', arguments: [] });
    usedImports.add('Index');
  }

  // Compose options
  const options: string[] = [];
  if (rel.isEager) options.push('eager: true');
  if (rel.isNullable !== undefined && rel.type !== 'one-to-many') {
    options.push(`nullable: ${rel.isNullable}`);
  }
  if (
    (rel.type === 'many-to-many' && !isInverse) ||
    rel.type === 'one-to-many'
  ) {
    options.push('cascade: true');
  }
  options.push(`onDelete: 'CASCADE'`, `onUpdate: 'CASCADE'`);

  // Build decorator arguments
  const args: string[] = [`'${target}'`];

  const relationCallback =
    !isInverse && rel.inversePropertyName
      ? `(rel: any) => rel.${rel.inversePropertyName}`
      : isInverse && rel.propertyName
        ? `(rel: any) => rel.${rel.propertyName}`
        : `(rel: any) => rel.id`; // fallback nếu không có inverse

  args.push(relationCallback);
  if (options.length) {
    args.push(`{ ${options.join(', ')} }`);
  }

  decorators.push({ name: relationType, arguments: args });

  // JoinTable or JoinColumn
  if (rel.type === 'many-to-many' && !isInverse) {
    decorators.push({ name: 'JoinTable', arguments: [] });
    usedImports.add('JoinTable');
  } else if (['many-to-one', 'one-to-one'].includes(rel.type)) {
    decorators.push({ name: 'JoinColumn', arguments: [] });
    usedImports.add('JoinColumn');
  }

  // Add the property
  classDeclaration.addProperty({
    name: rel.propertyName!,
    type: 'any',
    decorators,
  });
}
