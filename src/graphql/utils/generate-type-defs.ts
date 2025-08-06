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
  console.log('🔧 Starting GraphQL schema generation...');
  console.log('📋 Tables count:', tables.length);
  console.log('📊 Metadata count:', metadatas.length);

  let typeDefs = '';
  let queryDefs = '';
  let resultDefs = '';
  const processedTypes = new Set<string>();

  for (const table of tables) {
    if (!table?.name) {
      console.warn('Skipping table with invalid name:', table);
      continue;
    }

    const typeName = table.name;
    console.log(`\n🏗️  Processing table: ${typeName}`);

    // Skip if already processed
    if (processedTypes.has(typeName)) {
      console.warn('Skipping duplicate type:', typeName);
      continue;
    }
    processedTypes.add(typeName);

    typeDefs += `\ntype ${typeName} {\n`;
    console.log(`📝 Added type definition start for: ${typeName}`);

    // Lấy đúng EntityMetadata
    const entityMeta = metadatas.find((meta) => meta.tableName === table.name);
    if (!entityMeta) {
      console.warn(
        `❌ No entity metadata found for table: ${typeName} — using table.columns only`,
      );

      // Nếu có columns từ table thì dùng luôn
      if (table.columns && table.columns.length > 0) {
        for (const column of table.columns) {
          const fieldName = column?.name;
          const columnType = column?.type;

          if (
            !fieldName ||
            typeof fieldName !== 'string' ||
            !/^[A-Za-z_][A-Za-z0-9_]*$/.test(fieldName)
          ) {
            console.warn('⚠️ Skipping column with invalid name:', fieldName);
            continue;
          }

          if (!columnType || typeof columnType !== 'string') {
            console.warn('⚠️ Skipping column with invalid type:', columnType);
            continue;
          }

          const gqlType = mapColumnTypeToGraphQL(columnType);
          const isRequired = !column.isNullable ? '!' : '';

          const finalType =
            column.isPrimary && gqlType === 'ID'
              ? 'ID!'
              : `${gqlType}${isRequired}`;

          typeDefs += `  ${fieldName}: ${finalType}\n`;
        }
        typeDefs += `}\n`;
        continue;
      }

      // Nếu không có column nào, bỏ qua
      console.warn(`❌ No columns in table "${typeName}", skipping...`);
      typeDefs = typeDefs.slice(
        0,
        typeDefs.lastIndexOf(`type ${typeName} {\n`),
      ); // Xoá phần mở đầu
      continue;
    }

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

    // Add default timestamp fields if they exist in entity metadata
    const hasCreatedAt = entityMeta.columns.some(
      (col) => col.propertyName === 'createdAt',
    );
    const hasUpdatedAt = entityMeta.columns.some(
      (col) => col.propertyName === 'updatedAt',
    );

    if (hasCreatedAt) {
      typeDefs += `  createdAt: String!\n`;
    }
    if (hasUpdatedAt) {
      typeDefs += `  updatedAt: String!\n`;
    }

    // Relations → lấy từ entityMeta.relations
    for (const rel of entityMeta.relations) {
      if (!rel?.propertyName) {
        console.warn('Skipping relation with invalid propertyName:', rel);
        continue;
      }

      // Skip relation if no target metadata or table name
      if (!rel.inverseEntityMetadata?.tableName) {
        console.warn(
          'Skipping relation with missing target metadata:',
          rel.propertyName,
        );
        continue;
      }

      const relName = rel.propertyName;
      const targetType = rel.inverseEntityMetadata.tableName;

      console.log(`🔗 Processing relation: ${relName} -> ${targetType}`);

      // Validate target type name
      if (
        !targetType ||
        typeof targetType !== 'string' ||
        targetType.trim() === ''
      ) {
        console.warn(
          '❌ Skipping relation with invalid target type:',
          relName,
          targetType,
        );
        continue;
      }

      // Skip if target type same as current type (circular reference)
      if (targetType === typeName) {
        console.warn('⚠️ Skipping circular reference:', relName, targetType);
        continue;
      }

      const isArray = rel.isOneToMany || rel.isManyToMany;

      if (isArray) {
        const fieldDef = `  ${relName}: [${targetType}!]!\n`;
        console.log(`📝 Adding array relation field: ${fieldDef.trim()}`);
        typeDefs += fieldDef;
      } else {
        const fieldDef = `  ${relName}: ${targetType}\n`;
        console.log(`📝 Adding single relation field: ${fieldDef.trim()}`);
        typeDefs += fieldDef;
      }
    }

    typeDefs += `}\n`;

    // Generate XXXResult type
    resultDefs += `
type ${typeName}Result {
  data: [${typeName}!]!
  meta: MetaResult
}
`;

    // Generate Query field
    queryDefs += `  ${typeName}(
    filter: JSON,
    sort: [String!],
    page: Int,
    limit: Int
  ): ${typeName}Result!\n`;
  }

  const metaResultDef = `
type MetaResult {
  totalCount: Int
  filterCount: Int
  aggregate: JSON
}
`;

  const fullTypeDefs = `
scalar JSON
${typeDefs}
${resultDefs}
${metaResultDef}

type Query {
${queryDefs}
}
`;

  console.log('✅ GraphQL schema generation completed');
  console.log('📏 Final schema length:', fullTypeDefs.length);
  console.log('📄 Generated schema preview (first 500 chars):');
  console.log(fullTypeDefs.substring(0, 500));

  return fullTypeDefs;
}
