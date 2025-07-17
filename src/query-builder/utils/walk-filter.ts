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

      if (['and', 'or'].includes(key)) {
        walk(
          val,
          path,
          currentMeta,
          currentAlias,
          key === 'and' ? 'AND' : 'OR',
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

          if (
            typeof val === 'object' &&
            !Object.keys(val).some((k) => OPERATORS.includes(k))
          ) {
            walk(val, newPath, nextMeta, nextAlias, operator);
          } else {
            walk(val, newPath, currentMeta, currentAlias, operator);
          }
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
            sql = `lower(unaccent(${currentAlias}.${lastField})) COLLATE ${collation} LIKE CONCAT('%', lower(unaccent(:${paramKey})) COLLATE ${collation}, '%')`;
            param[paramKey] = parsedValue;
            break;

          case '_starts_with':
            sql = `lower(unaccent(${currentAlias}.${lastField})) COLLATE ${collation} LIKE CONCAT(lower(unaccent(:${paramKey})) COLLATE ${collation}, '%')`;
            param[paramKey] = parsedValue;
            break;

          case '_ends_with':
            sql = `lower(unaccent(${currentAlias}.${lastField})) COLLATE ${collation} LIKE CONCAT('%', lower(unaccent(:${paramKey})) COLLATE ${collation})`;
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
