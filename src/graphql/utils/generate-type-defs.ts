function mapColumnTypeToGraphQL(type: string): string {
  const map: Record<string, string> = {
    int: 'Int',
    integer: 'Int',
    float: 'Float',
    double: 'Float',
    decimal: 'Float',
    numeric: 'Float',
    real: 'Float',
    boolean: 'Boolean',
    bool: 'Boolean',
    varchar: 'String',
    text: 'String',
    uuid: 'ID',
    date: 'String',
    datetime: 'String',
    timestamp: 'String',
    json: 'JSON',
    'simple-json': 'JSON',
  };
  return map[type] || 'String';
}

export function generateTypeDefsFromTables(tables: any[]): string {
  let typeDefs = '';

  const typeNames: string[] = [];

  for (const table of tables) {
    const typeName = table.name;
    typeNames.push(typeName);

    typeDefs += `\ntype ${typeName} {\n`;

    for (const column of table.columns || []) {
      const gqlType = mapColumnTypeToGraphQL(column.type);
      const fieldName = column.name;
      const isRequired = !column.isNullable ? '!' : '';

      // Primary key -> ID
      const finalType =
        column.isPrimary && gqlType === 'ID'
          ? 'ID!'
          : `${gqlType}${isRequired}`;

      typeDefs += `  ${fieldName}: ${finalType}\n`;
    }

    for (const rel of table.relations || []) {
      const relName = rel.propertyName;
      const targetType = rel.targetTable?.name || 'UNKNOWN';

      if (['many-to-one', 'one-to-one'].includes(rel.type)) {
        typeDefs += `  ${relName}: ${targetType}\n`;
      } else if (['one-to-many', 'many-to-many'].includes(rel.type)) {
        typeDefs += `  ${relName}: [${targetType}!]!\n`;
      }
    }

    typeDefs += `}\n`;
  }

  // Build union DynamicType
  const unionDef =
    typeNames.length > 0
      ? `\nunion DynamicType = ${typeNames.join(' | ')}\n`
      : '';

  // MetaResult
  const metaResultDef = `
type MetaResult {
  totalCount: Int
  filterCount: Int
  aggregate: JSON
}
`;

  // DynamicResolverResult
  const dynamicResolverResultDef = `
type DynamicResolverResult {
  data: [DynamicType!]!
  meta: MetaResult
}
`;

  // Query
  const queryDef = `
type Query {
  dynamicResolver(
    filter: JSON,
    sort: [String!],
    page: Int,
    limit: Int
  ): DynamicResolverResult!
}
`;

  const fullTypeDefs = `
scalar JSON
${typeDefs}
${unionDef}
${metaResultDef}
${dynamicResolverResultDef}
${queryDef}
`;

  return fullTypeDefs;
}
