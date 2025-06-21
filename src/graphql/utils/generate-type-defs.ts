import { EntityMetadata } from 'typeorm';

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

export function generateTypeDefsFromTables(
  tables: any[],
  metadatas: EntityMetadata[],
): string {
  let typeDefs = '';
  const typeNames: string[] = [];

  for (const table of tables) {
    const typeName = table.name;
    typeNames.push(typeName);

    typeDefs += `\ntype ${typeName} {\n`;

    // Lấy đúng EntityMetadata
    const entityMeta = metadatas.find((meta) => meta.tableName === table.name);
    if (!entityMeta) continue;

    // Scalar columns
    for (const column of table.columns || []) {
      const gqlType = mapColumnTypeToGraphQL(column.type);
      const fieldName = column.name;
      const isRequired = !column.isNullable ? '!' : '';

      const finalType =
        column.isPrimary && gqlType === 'ID'
          ? 'ID!'
          : `${gqlType}${isRequired}`;

      typeDefs += `  ${fieldName}: ${finalType}\n`;
    }

    // Relations → lấy từ entityMeta.relations
    for (const rel of entityMeta.relations) {
      const relName = rel.propertyName;
      const targetType = rel.inverseEntityMetadata?.tableName || 'UNKNOWN';
      const isArray = rel.isOneToMany || rel.isManyToMany; // chính xác hơn là isArray relation

      if (isArray) {
        typeDefs += `  ${relName}: [${targetType}!]!\n`;
      } else {
        typeDefs += `  ${relName}: ${targetType}\n`;
      }
    }

    typeDefs += `}\n`;
  }

  const unionDef =
    typeNames.length > 0
      ? `\nunion DynamicType = ${typeNames.join(' | ')}\n`
      : '';

  const metaResultDef = `
type MetaResult {
  totalCount: Int
  filterCount: Int
  aggregate: JSON
}
`;

  const dynamicResolverResultDef = `
type DynamicResolverResult {
  data: [DynamicType!]!
  meta: MetaResult
}
`;

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
