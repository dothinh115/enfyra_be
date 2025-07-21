import { DataSource } from 'typeorm';
import { QueryEngine } from '../query-engine.service';

export async function resolveDeepRelations(options: {
  queryEngine: QueryEngine;
  dataSource: DataSource;
  tableName: string;
  rows: any[];
  metaData: any;
  deep: Record<string, any>;
  log?: string[];
}) {
  const {
    queryEngine,
    dataSource,
    tableName,
    rows,
    metaData,
    deep,
    log = [],
  } = options;

  const ids = rows.map((r) => r.id);
  const metaDeep: Record<string, any[]> = {};

  for (const relationName of Object.keys(deep)) {
    const relationMeta = metaData.relations.find(
      (r) => r.propertyName === relationName,
    );
    if (!relationMeta) continue;

    const childTable = relationMeta.inverseEntityMetadata.tableName;

    const isInverse = !!relationMeta.inverseRelation;

    const joinColumn = isInverse
      ? (relationMeta.inverseRelation?.joinColumns?.[0] ??
        relationMeta.inverseRelation?.inverseJoinColumns?.[0])
      : relationMeta.joinColumns?.[0];

    if (!joinColumn?.propertyName) {
      log.push(
        `! Deep relation "${relationName}" bị bỏ qua do không xác định được foreignKey`,
      );
      continue;
    }

    const foreignKey = joinColumn.propertyName;
    const deepOptions = deep[relationName];

    const deepFields: string[] = Array.isArray(deepOptions?.fields)
      ? [...deepOptions.fields]
      : typeof deepOptions?.fields === 'string'
        ? deepOptions.fields.split(',')
        : ['*'];

    if (!deepFields.includes(foreignKey)) deepFields.push(foreignKey);

    const relationMap = new Map<number, any[]>();
    const metaList: any[] = [];

    const results = await Promise.all(
      ids.map((id) =>
        queryEngine
          .find({
            tableName: childTable,
            filter: {
              [foreignKey]: {
                id: { _eq: id },
              },
            },
            fields: deepFields,
            sort: deepOptions?.sort,
            page: deepOptions?.page,
            limit: deepOptions?.limit,
            meta: deepOptions?.meta,
            deep: deepOptions?.deep,
          })
          .then((result) => ({ id, ...result }))
          .catch((error) => {
            log.push(
              `! Deep relation "${relationName}" thất bại với id ${id}: ${error.message}`,
            );
            return { id, data: [], meta: null };
          }),
      ),
    );

    for (const res of results) {
      relationMap.set(res.id, res.data);
      if (res.meta) {
        metaList.push({ id: res.id, ...res.meta });
      }
    }

    for (const row of rows) {
      row[relationName] = relationMap.get(row.id) ?? [];
    }

    if (metaList.length > 0) {
      metaDeep[relationName] = metaList;
    }
  }

  return metaDeep;
}
