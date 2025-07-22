import { EntityMetadata } from 'typeorm';
import { lookupFieldOrRelation } from './lookup-field-or-relation';
import { parseValue } from './parse-value';

const OPERATORS = [
  '_eq',
  '_neq',
  '_gt',
  '_gte',
  '_lt',
  '_lte',
  '_in',
  '_not_in',
  '_between',
  '_not',
  '_is_null',
  '_count',
  '_eq_set',
  '_contains',
  '_starts_with',
  '_ends_with',
];

const AGG_KEYS = ['_count', '_sum', '_avg', '_min', '_max'];

export function walkFilter({
  filter,
  currentMeta,
  currentAlias,
  operator = 'AND',
  path = [],
  log = [],
}: {
  filter: any;
  currentMeta: EntityMetadata;
  currentAlias: string;
  operator?: 'AND' | 'OR';
  path?: string[];
  log?: string[];
}): {
  parts: { operator: 'AND' | 'OR'; sql: string; params: any }[];
} {
  const parts: { operator: 'AND' | 'OR'; sql: string; params: any }[] = [];
  let paramIndex = 1;

  const operatorMap: Record<string, string> = {
    _eq: '=',
    _neq: '!=',
    _gt: '>',
    _gte: '>=',
    _lt: '<',
    _lte: '<=',
  };

  const walk = (
    f: any,
    path: string[],
    currentMeta: EntityMetadata,
    currentAlias: string,
    operator: 'AND' | 'OR',
  ) => {
    if (!f || typeof f !== 'object') return;
    if (Array.isArray(f)) {
      for (const item of f)
        walk(item, path, currentMeta, currentAlias, operator);
      return;
    }

    for (const key in f) {
      const val = f[key];

      if (['_and', '_or'].includes(key)) {
        walk(
          val,
          path,
          currentMeta,
          currentAlias,
          key === '_and' ? 'AND' : 'OR',
        );
        continue;
      }

      if (key === '_not') {
        const subParts = walkFilter({
          filter: val,
          currentMeta,
          currentAlias,
          operator: 'AND',
          path,
        });
        subParts.parts.forEach((p) => {
          parts.push({ operator, sql: `NOT (${p.sql})`, params: p.params });
          log.push?.(`[${operator}] NOT (${p.sql})`);
        });
        continue;
      }

      if (!OPERATORS.includes(key)) {
        const found = lookupFieldOrRelation(currentMeta, key);
        if (!found) continue;

        const newPath = [...path, key];

        if (found.kind === 'relation') {
          const nextMeta = currentMeta.connection.getMetadata(found.type);
          const nextAlias = `${currentAlias}_${key}`;

          const isAggregate =
            typeof val === 'object' &&
            Object.keys(val).some((k) => AGG_KEYS.includes(k));

          if (isAggregate) {
            const inverse = nextMeta.relations.find(
              (r) => r.inverseEntityMetadata.name === currentMeta.name,
            );
            const foreignKey = inverse?.joinColumns?.[0]?.databaseName;
            if (!foreignKey) {
              console.log(`[Relation] ❌ Cannot find foreign key`);
              continue;
            }

            for (const aggKey of AGG_KEYS) {
              const aggVal = val[aggKey];
              if (!aggVal) continue;

              if (aggKey === '_count') {
                if (!aggVal || typeof aggVal !== 'object') {
                  console.log(`[Aggregate] ❌ Invalid _count block`);
                  continue;
                }
                for (const op in aggVal) {
                  const opSymbol = operatorMap[op];
                  if (!opSymbol) {
                    console.log(
                      `[Aggregate] ❌ Unsupported _count operator: ${op}`,
                    );
                    continue;
                  }

                  let parsedValue;
                  try {
                    parsedValue = parseValue('number', aggVal[op]);
                  } catch {
                    console.log(
                      `[Aggregate] ❌ Invalid value for _count.${op}:`,
                      aggVal[op],
                    );
                    continue;
                  }

                  const paramKey = `p${paramIndex++}`;
                  const subquery = `(SELECT COUNT(*) FROM ${nextMeta.tableName} WHERE ${nextMeta.tableName}.${foreignKey} = ${currentAlias}.id)`;
                  const sql = `${subquery} ${opSymbol} :${paramKey}`;
                  parts.push({
                    operator,
                    sql,
                    params: { [paramKey]: parsedValue },
                  });
                }
              } else {
                for (const field in aggVal) {
                  const ops = aggVal[field];
                  if (typeof ops !== 'object') {
                    console.log(
                      `[Aggregate] ❌ Invalid block: ${aggKey}.${field}`,
                    );
                    continue;
                  }

                  const fieldMeta = nextMeta.columns.find(
                    (c) => c.propertyName === field,
                  );
                  if (!fieldMeta) {
                    console.log(
                      `[Aggregate] ❌ Unknown field in ${nextMeta.name}:`,
                      field,
                    );
                    continue;
                  }

                  const rawType = fieldMeta.type;
                  const fieldType =
                    typeof rawType === 'string'
                      ? rawType
                      : rawType.name.toLowerCase();

                  for (const op in ops) {
                    const opSymbol = operatorMap[op];
                    if (!opSymbol) {
                      console.log(
                        `[Aggregate] ❌ Unsupported operator: ${aggKey}.${field}.${op}`,
                      );
                      continue;
                    }

                    let parsedValue;
                    try {
                      parsedValue = parseValue(fieldType, ops[op]);
                    } catch {
                      console.log(
                        `[Aggregate] ❌ Cannot parse value for ${aggKey}.${field}.${op}:`,
                        ops[op],
                      );
                      continue;
                    }

                    if (
                      parsedValue === null ||
                      (typeof parsedValue === 'number' && isNaN(parsedValue))
                    ) {
                      console.log(
                        `[Aggregate] ❌ Invalid parsed value for ${aggKey}.${field}.${op}`,
                      );
                      continue;
                    }

                    let sqlFunc = '';
                    switch (aggKey) {
                      case '_sum':
                        sqlFunc = 'SUM';
                        break;
                      case '_avg':
                        sqlFunc = 'AVG';
                        break;
                      case '_min':
                        sqlFunc = 'MIN';
                        break;
                      case '_max':
                        sqlFunc = 'MAX';
                        break;
                      default:
                        continue;
                    }

                    const subquery = `(SELECT ${sqlFunc}(${nextMeta.tableName}.${field}) FROM ${nextMeta.tableName} WHERE ${nextMeta.tableName}.${foreignKey} = ${currentAlias}.id)`;
                    const paramKey = `p${paramIndex++}`;
                    const sql = `${subquery} ${opSymbol} :${paramKey}`;
                    console.log(`[Aggregate] ✅ SQL = ${sql}`);
                    parts.push({
                      operator,
                      sql,
                      params: { [paramKey]: parsedValue },
                    });
                  }
                }
              }
            }
            continue;
          }

          if (
            typeof val === 'object' &&
            !Object.keys(val).some((k) => OPERATORS.includes(k))
          ) {
            walk(val, newPath, nextMeta, nextAlias, operator);
          } else {
            walk(val, newPath, currentMeta, currentAlias, operator);
          }
          continue;
        } else {
          if (typeof val === 'object') {
            walk(val, newPath, currentMeta, currentAlias, operator);
          }
        }
        continue;
      }

      const lastField = path[path.length - 1];
      const found = lookupFieldOrRelation(currentMeta, lastField);
      if (!found) continue;

      const paramKey = `p${paramIndex++}`;
      const param = {};
      let sql = '';

      if (found.kind === 'field') {
        const fieldType = found.type;
        const parsedValue = parseValue(fieldType, val);

        const isSQLite =
          currentMeta.connection.driver.options.type === 'sqlite';
        const collation = 'utf8mb4_general_ci';

        switch (key) {
          case '_eq':
            sql = `${currentAlias}.${lastField} = :${paramKey}`;
            param[paramKey] = parsedValue;
            break;
          case '_neq':
            sql = `${currentAlias}.${lastField} != :${paramKey}`;
            param[paramKey] = parsedValue;
            break;
          case '_gt':
            sql = `${currentAlias}.${lastField} > :${paramKey}`;
            param[paramKey] = parsedValue;
            break;
          case '_gte':
            sql = `${currentAlias}.${lastField} >= :${paramKey}`;
            param[paramKey] = parsedValue;
            break;
          case '_lt':
            sql = `${currentAlias}.${lastField} < :${paramKey}`;
            param[paramKey] = parsedValue;
            break;
          case '_lte':
            sql = `${currentAlias}.${lastField} <= :${paramKey}`;
            param[paramKey] = parsedValue;
            break;
          case '_between': {
            const p1 = `p${paramIndex++}`;
            const p2 = `p${paramIndex++}`;
            sql = `${currentAlias}.${lastField} BETWEEN :${p1} AND :${p2}`;
            param[p1] = parseValue(fieldType, val[0]);
            param[p2] = parseValue(fieldType, val[1]);
            break;
          }
          case '_is_null':
            sql = `${currentAlias}.${lastField} IS ${val ? '' : 'NOT '}NULL`;
            break;
          case '_contains':
            if (isSQLite) {
              sql = `${currentAlias}.${lastField} LIKE '%' || :${paramKey} || '%'`;
            } else {
              sql = `lower(unaccent(${currentAlias}.${lastField})) COLLATE ${collation} LIKE CONCAT('%', lower(unaccent(:${paramKey})) COLLATE ${collation}, '%')`;
            }
            param[paramKey] = parsedValue;
            break;
          case '_starts_with':
            if (isSQLite) {
              sql = `${currentAlias}.${lastField} LIKE :${paramKey} || '%'`;
            } else {
              sql = `lower(unaccent(${currentAlias}.${lastField})) COLLATE ${collation} LIKE CONCAT(lower(unaccent(:${paramKey})) COLLATE ${collation}, '%')`;
            }
            param[paramKey] = parsedValue;
            break;
          case '_ends_with':
            if (isSQLite) {
              sql = `${currentAlias}.${lastField} LIKE '%' || :${paramKey}`;
            } else {
              sql = `lower(unaccent(${currentAlias}.${lastField})) COLLATE ${collation} LIKE CONCAT('%', lower(unaccent(:${paramKey})) COLLATE ${collation})`;
            }
            param[paramKey] = parsedValue;
            break;
          default:
            continue;
        }
      }

      if (sql) {
        parts.push({ operator, sql, params: param });
        log.push?.(`[${operator}] ${sql}`);
      }
    }
  };

  walk(filter, path, currentMeta, currentAlias, operator);
  return { parts };
}
