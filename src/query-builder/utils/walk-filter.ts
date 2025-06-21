import { Brackets, EntityMetadata } from 'typeorm';
import { OPERATOR_MAP } from './operator-map';
import { parseArray } from './parse-array';
import { resolveRelationPath } from './resolve-relation-path';

export function walkFilter(
  obj: any,
  path: string[],
  currentMeta: EntityMetadata,
  type: 'and' | 'or',
  qb: any,
  params: Record<string, any>,
  negate = false,
  rootAlias: string,
  aliasMap: Map<string, string>,
  joinSet: Set<string>,
  select: Set<string>,
) {
  const method = type === 'and' ? 'andWhere' : 'orWhere';
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
  for (const key in obj) {
    const value = obj[key];

    if (key === 'and' || key === 'or') {
      qb[method](
        new Brackets((subQb) => {
          for (const item of value) {
            walkFilter(
              item,
              path,
              currentMeta,
              key as 'and' | 'or',
              subQb,
              params,
              negate,
              rootAlias,
              aliasMap,
              joinSet,
              select,
            );
          }
        }),
      );
      continue;
    }

    if (key === '_not') {
      qb[method](
        new Brackets((subQb) => {
          walkFilter(
            value,
            path,
            currentMeta,
            'and',
            subQb,
            params,
            !negate,
            rootAlias,
            aliasMap,
            joinSet,
            select,
          );
        }),
      );
      continue;
    }

    const rel = currentMeta.relations.find((r) => r.propertyName === key);
    if (rel) {
      const newPath = [...path, key];

      if (!rel.inverseEntityMetadata || !rel.inverseRelation) {
        throw new Error(
          `Cannot use _count on relation '${key}' — inverse relation missing.`,
        );
      }

      resolveRelationPath(
        newPath,
        currentMeta,
        rootAlias,
        aliasMap,
        joinSet,
        select,
      );

      // Xử lý _count trên quan hệ
      if (typeof value === 'object' && value !== null && '_count' in value) {
        const alias = `sub_${params.__countAlias || 0}`;
        const countAliasIndex = params.__countAlias || 0;
        params.__countAlias = countAliasIndex + 1;

        const inverseTable = rel.inverseEntityMetadata.tableName;
        const inverseKey =
          rel.inverseEntityMetadata.primaryColumns[0]?.propertyName || 'id';
        const joinKey = rel.inverseRelation?.joinColumns?.[0]?.databaseName;
        if (!joinKey) throw new Error(`Missing join key for relation '${key}'`);

        const countValue = value._count;
        if ('id' in countValue) {
          value._count = value._count.id;
        }

        for (const op in value._count) {
          const sqlOp = OPERATOR_MAP[op];

          if (!sqlOp) continue;

          const paramKey = `count_${countAliasIndex}_${Object.keys(params).length}`;
          const val = value._count[op];
          params[paramKey] = val;

          const subquery = `
            SELECT ${alias}.${joinKey}
            FROM ${inverseTable} ${alias}
            GROUP BY ${alias}.${joinKey}
            HAVING COUNT(DISTINCT ${alias}.${inverseKey}) ${sqlOp} :${paramKey}
          `;

          const wrappedSubquery = `(${subquery})`; // 👈 fix lỗi alias

          const mainId = `${rootAlias}.${currentMeta.primaryColumns[0].propertyName}`;
          console.log('[DEBUG] _count QB method:', method, 'SQL:', subquery);

          qb[method](
            `${mainId} ${negate ? 'NOT IN' : 'IN'} ${wrappedSubquery}`,
          );
        }

        delete value._count;
        if (Object.keys(value).length === 0) {
          console.log('[DEBUG] Done _count → skip walkFilter');
          continue;
        }
      }

      // if (
      //   typeof value === 'object' &&
      //   value !== null &&
      //   'id' in value &&
      //   typeof value.id === 'object' &&
      //   (value.id._in || value.id._nin)
      // ) {
      //   const isNin = '_nin' in value.id;
      //   const ids = parseArray(isNin ? value.id._nin : value.id._in);
      //   const paramKey = `rel_${key}_ids_${Object.keys(params).length}`;
      //   params[paramKey] = ids;

      //   const subAlias = `sub_${key}`;
      //   const inverseTable = rel.inverseEntityMetadata.tableName;
      //   const foreignKey = rel.inverseRelation?.joinColumns?.[0]?.databaseName;
      //   const rootKey = currentMeta.primaryColumns[0].propertyName;
      //   const inverseKey =
      //     rel.inverseEntityMetadata.primaryColumns[0].propertyName;

      //   if (!foreignKey) {
      //     throw new Error(`Relation ${key} is missing join column`);
      //   }

      //   const subquery = `
      //     SELECT 1 FROM ${inverseTable} ${subAlias}
      //     WHERE ${subAlias}.${foreignKey} = ${rootAlias}.${rootKey}
      //     AND ${subAlias}.${inverseKey} ${value.id._nin ? 'NOT IN' : 'IN'} (:...${paramKey})
      //   `;

      //   qb[method](`${negate ? 'NOT EXISTS' : 'EXISTS'} (${subquery})`);
      //   continue;
      // }

      const idOps = ['_in', '_nin', '_eq', '_neq'];

      for (const op of idOps) {
        if (value.id?.[op]) {
          const isNeg = op === '_nin' || op === '_neq';
          const ids = parseArray(value.id[op]);
          const paramKey = `rel_${key}_ids_${Object.keys(params).length}`;
          params[paramKey] = ids;

          const subAlias = `sub_${key}`;
          const inverseTable = rel.inverseEntityMetadata.tableName;
          const foreignKey =
            rel.inverseRelation?.joinColumns?.[0]?.databaseName;
          const rootKey = currentMeta.primaryColumns[0].propertyName;
          const inverseKey =
            rel.inverseEntityMetadata.primaryColumns[0]?.propertyName;

          if (!foreignKey) {
            throw new Error(`Relation ${key} is missing join column`);
          }

          const subquery = `
            SELECT 1 FROM ${inverseTable} ${subAlias}
            WHERE ${subAlias}.${foreignKey} = ${rootAlias}.${rootKey}
            AND ${subAlias}.${inverseKey} IN (:...${paramKey})
          `;

          qb[method](
            `${negate ? 'NOT EXISTS' : isNeg ? 'NOT EXISTS' : 'EXISTS'} (${subquery})`,
          );

          // Chặn không cho filter tiếp `.id`
          delete value.id;
          if (Object.keys(value).length === 0) continue;
        }
      }

      if (
        typeof value === 'object' &&
        value !== null &&
        'id' in value &&
        typeof value.id === 'object' &&
        value.id._eq_set
      ) {
        const ids = parseArray(value.id._eq_set);
        const paramKey = `eqset_${key}_${Object.keys(params).length}`;
        params[paramKey] = ids;

        const subAlias = `sub_${key}`;
        const inverseTable = rel.inverseEntityMetadata.tableName;
        const foreignKey = rel.inverseRelation?.joinColumns?.[0]?.databaseName;
        const rootKey = currentMeta.primaryColumns[0].propertyName;
        const inverseKey =
          rel.inverseEntityMetadata.primaryColumns[0].propertyName;

        if (!foreignKey) {
          throw new Error(`Relation ${key} is missing join column`);
        }

        const countKey = `${paramKey}_count`;
        params[paramKey] = ids;
        params[countKey] = ids.length;

        const subquery = `
        SELECT ${subAlias}.${foreignKey}
        FROM ${inverseTable} ${subAlias}
        GROUP BY ${subAlias}.${foreignKey}
        HAVING 
          COUNT(DISTINCT ${subAlias}.${inverseKey}) = :${countKey}
          AND COUNT(DISTINCT CASE WHEN ${subAlias}.${inverseKey} IN (:...${paramKey}) THEN ${subAlias}.${inverseKey} END) = :${countKey}
      `;

        const mainId = `${rootAlias}.${rootKey}`;
        qb[method](`${mainId} ${negate ? 'NOT IN' : 'IN'} (${subquery})`);
        continue;
      }

      resolveRelationPath(
        newPath,
        currentMeta,
        rootAlias,
        aliasMap,
        joinSet,
        select,
      );

      // Quan hệ lồng nhau
      walkFilter(
        value,
        newPath,
        rel.inverseEntityMetadata,
        'and',
        qb,
        params,
        negate,
        rootAlias,
        aliasMap,
        joinSet,
        select,
      );
      continue;
    }

    const column = currentMeta.columns.find((c) => c.propertyName === key);
    if (!column) continue;

    const fieldPath = path.join('.');
    const alias = aliasMap.get(fieldPath) || rootAlias;
    const field = `${alias}.${key}`;

    if (typeof value === 'object' && value !== null) {
      for (const op in value) {
        const paramKey = `${key}_${Object.keys(params).length}`;
        let val = value[op];
        let sqlOp = OPERATOR_MAP[op];

        // Special cases
        if (['_in', '_nin', '_eq_set'].includes(op)) {
          val = parseArray(val);
        }

        if (['_contains', '_starts_with', '_ends_with', '_like'].includes(op)) {
          const pattern =
            op === '_contains'
              ? `%${val}%`
              : op === '_starts_with'
                ? `${val}%`
                : op === '_ends_with'
                  ? `%${val}`
                  : val;

          qb[method](
            negate
              ? `NOT (LOWER(unaccent(${field})) LIKE LOWER(unaccent(:${paramKey})))`
              : `LOWER(unaccent(${field})) LIKE LOWER(unaccent(:${paramKey}))`,
            { [paramKey]: pattern },
          );
          params[paramKey] = pattern;
          continue;
        }

        if (
          (op === '_between' || op === '_nbetween') &&
          Array.isArray(val) &&
          val.length === 2
        ) {
          const [from, to] = val;
          const fromKey = `${paramKey}_from`,
            toKey = `${paramKey}_to`;
          params[fromKey] = from;
          params[toKey] = to;
          const expr = `${field} BETWEEN :${fromKey} AND :${toKey}`;
          qb[method](negate || op === '_nbetween' ? `NOT (${expr})` : expr);
          continue;
        }

        if (sqlOp === 'IN' || sqlOp === 'NOT IN') {
          qb[method](
            negate
              ? `NOT (${field} ${sqlOp} (:...${paramKey}))`
              : `${field} ${sqlOp} (:...${paramKey})`,
            { [paramKey]: val },
          );
        } else if (op === '_is_null' || op === '_is_nnull') {
          const isNull = op === '_is_null';
          qb[method](
            negate
              ? `NOT (${field} IS ${isNull ? '' : 'NOT '}NULL)`
              : `${field} IS ${isNull ? '' : 'NOT '}NULL`,
          );
        } else if (sqlOp) {
          qb[method](
            negate
              ? `NOT (${field} ${sqlOp} :${paramKey})`
              : `${field} ${sqlOp} :${paramKey}`,
            { [paramKey]: val },
          );
        }

        params[paramKey] = val;
      }
    } else {
      const paramKey = `${key}_${Object.keys(params).length}`;
      qb[method](
        negate ? `NOT (${field} = :${paramKey})` : `${field} = :${paramKey}`,
        { [paramKey]: value },
      );
      params[paramKey] = value;
    }
  }
}
