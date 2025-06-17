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

  const propertyType = ['many-to-many', 'one-to-many'].includes(rel.type)
    ? `${target}[]`
    : target;

  const decorators = [];

  const shouldAddIndex =
    rel.isIndex &&
    (rel.type === 'many-to-one' || (rel.type === 'one-to-one' && !isInverse));
  if (shouldAddIndex) {
    decorators.push({ name: 'Index', arguments: [] });
    usedImports.add('Index');
  }

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

  const args = [`() => ${target}`];
  if (rel.inversePropertyName) {
    args.push(`(rel) => rel.${rel.inversePropertyName}`);
  }
  if (options.length) {
    args.push(`{ ${options.join(', ')} }`);
  }

  decorators.push({ name: relationType, arguments: args });

  if (rel.type === 'many-to-many' && !isInverse) {
    decorators.push({ name: 'JoinTable', arguments: [] });
    usedImports.add('JoinTable');
  } else if (['many-to-one', 'one-to-one'].includes(rel.type)) {
    decorators.push({ name: 'JoinColumn', arguments: [] });
    usedImports.add('JoinColumn');
  }

  classDeclaration.addProperty({
    name: rel.propertyName!,
    type: propertyType,
    decorators,
  });
}
