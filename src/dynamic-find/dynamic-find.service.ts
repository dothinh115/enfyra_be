import { Injectable } from '@nestjs/common';
import { DataSourceService } from '../data-source/data-source.service';
import { Brackets, EntityMetadata } from 'typeorm';

const OPERATOR_MAP: Record<string, string> = {
  _eq: '=',
  _ne: '!=',
  _lt: '<',
  _lte: '<=',
  _gt: '>',
  _gte: '>=',
  _in: 'IN',
  _nin: 'NOT IN',
  _like: 'LIKE',
  _is_null: 'IS NULL',
};

@Injectable()
export class DynamicFindService {
  constructor(private dataSourceService: DataSourceService) {}

  extractRelationsAndFieldsAndWhere({
    fields,
    tableName,
    filter,
  }: {
    fields: string[] | string;
    tableName: string;
    filter?: any;
  }): {
    select: string[];
    joinArr: { path: string; alias: string }[];
    where: Brackets;
    params: Record<string, any>;
  } {
    let paramCounter = 0;
    const dataSource = this.dataSourceService.getDataSource();
    fields =
      typeof fields === 'string'
        ? fields
            .split(',')
            .map((f) => f.trim())
            .filter(Boolean)
        : fields;

    const select = new Set<string>();
    const joinArr: { path: string; alias: string }[] = [];
    const aliasMap = new Map<string, string>();
    const rootAlias = tableName;
    aliasMap.set('', rootAlias);

    const rootMetadata = dataSource.entityMetadatas.find(
      (m) => m.tableName === tableName,
    );
    if (!rootMetadata) throw new Error(`Entity not found: ${tableName}`);

    const whereParams: Record<string, any> = {};
    const where = new Brackets((qb) => {
      if (filter) walkFilter(filter, [], rootMetadata, 'and', qb);
    });

    function resolveRelationPath(path: string[], currentMeta: EntityMetadata) {
      let fullPath = '';
      for (let i = 0; i < path.length; i++) {
        const part = path[i];
        fullPath = fullPath ? `${fullPath}.${part}` : part;
        const alias = `__${fullPath.replace(/\./g, '_')}__`;
        if (!aliasMap.has(fullPath)) {
          const parentPath = path.slice(0, i).join('.');
          const parentAlias = aliasMap.get(parentPath) || rootAlias;
          joinArr.push({ path: `${parentAlias}.${part}`, alias });
          aliasMap.set(fullPath, alias);
        }
        const rel = currentMeta.relations.find((r) => r.propertyName === part);
        if (!rel) break;
        currentMeta = rel.inverseEntityMetadata;
      }
    }

    function walkFilter(
      obj: any,
      path: string[] = [],
      currentMeta = rootMetadata,
      type: 'and' | 'or' = 'and',
      qb?: any,
    ) {
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
      const method = type === 'and' ? 'andWhere' : 'orWhere';

      for (const key in obj) {
        const value = obj[key];

        if (key === 'and' || key === 'or') {
          const nested = new Brackets((subQb) => {
            for (const sub of value) {
              walkFilter(sub, path, currentMeta, key as 'and' | 'or', subQb);
            }
          });
          qb?.[method](nested);
          continue;
        }

        const rel = currentMeta.relations.find((r) => r.propertyName === key);
        if (rel) {
          const newPath = [...path, key];
          resolveRelationPath(newPath, rootMetadata);

          if (
            typeof value === 'object' &&
            value !== null &&
            '_eq_set' in value
          ) {
            const exactIds = value['_eq_set'];
            const pathStr = path.join('.');
            const fieldAlias = aliasMap.get(pathStr) || rootAlias;

            const junctionMeta = rel.junctionEntityMetadata;
            if (!junctionMeta) continue;

            const joinCol = junctionMeta.columns.find(
              (c) => c.databaseName === rel.joinColumns[0]?.databaseName,
            );
            const inverseJoinCol = junctionMeta.columns.find(
              (c) => c.databaseName === rel.inverseJoinColumns[0]?.databaseName,
            );
            if (!joinCol || !inverseJoinCol) continue;

            const tableName = junctionMeta.tableName;

            qb?.[method](`
            ${fieldAlias}.id IN (
              SELECT ${joinCol.databaseName} FROM ${tableName}
              GROUP BY ${joinCol.databaseName}
              HAVING COUNT(DISTINCT ${inverseJoinCol.databaseName}) = :__eqset_len
              AND SUM(${inverseJoinCol.databaseName} IN (:...__eqset_ids)) = :__eqset_len
            )
          `);

            whereParams['__eqset_len'] = exactIds.length;
            whereParams['__eqset_ids'] = exactIds;
            continue;
          }

          walkFilter(value, newPath, rel.inverseEntityMetadata, 'and', qb);
          continue;
        }

        if (typeof value === 'object' && value !== null) {
          for (const op in value) {
            const operator = OPERATOR_MAP[op];
            if (!operator) continue;

            const pathStr = path.join('.');
            const fieldAlias = aliasMap.get(pathStr) || rootAlias;
            const field = `${fieldAlias}.${key}`;
            const paramName = `param${paramCounter++}`;

            if (op === '_is_null') {
              qb?.[method](`${field} IS ${value[op] ? '' : 'NOT '}NULL`);
            } else if (op === '_in' || op === '_nin') {
              qb?.[method](`${field} ${operator} (:...${paramName})`, {
                [paramName]: value[op],
              });
              whereParams[paramName] = value[op];
            } else {
              const finalValue = op === '_like' ? `%${value[op]}%` : value[op];
              qb?.[method](`${field} ${operator} :${paramName}`, {
                [paramName]: finalValue,
              });
              whereParams[paramName] = finalValue;
            }
          }
        }
      }
    }

    if (!fields.length) {
      for (const column of rootMetadata.columns) {
        if (!column.relationMetadata) {
          select.add(`${rootAlias}.${column.propertyName}`);
        }
      }
      for (const rel of rootMetadata.relations) {
        const alias = `__${rel.propertyName}__`;
        joinArr.push({ path: `${rootAlias}.${rel.propertyName}`, alias });
        const idColumn =
          rel.inverseEntityMetadata.primaryColumns[0]?.propertyName || 'id';
        select.add(`${alias}.${idColumn}`);
      }
    } else {
      for (const rawField of fields) {
        const parts = rawField.split('.');
        let currentMeta = rootMetadata;
        let fullPath = '';
        const isWildcard = parts.at(-1) === '*';

        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          if (part === '*') break;

          fullPath = fullPath ? `${fullPath}.${part}` : part;
          const parentPath = fullPath.split('.').slice(0, -1).join('.');
          const parentAlias = aliasMap.get(parentPath) || rootAlias;
          const alias = `__${fullPath.replace(/\./g, '_')}__`;

          const rel = currentMeta.relations.find(
            (r) => r.propertyName === part,
          );
          if (rel) {
            if (!aliasMap.has(fullPath)) {
              aliasMap.set(fullPath, alias);
              joinArr.push({ path: `${parentAlias}.${part}`, alias });
            }
            currentMeta = rel.inverseEntityMetadata;
          } else {
            if (i === parts.length - 1 && !isWildcard) {
              select.add(`${parentAlias}.${part}`);
            }
          }
        }

        if (isWildcard) {
          const pathToEntity = parts.slice(0, -1);
          const alias = aliasMap.get(pathToEntity.join('.'));
          const targetMeta = this.getMetadataByPath(pathToEntity, rootMetadata);
          if (targetMeta && alias) {
            for (const col of targetMeta.columns) {
              if (col.relationMetadata) {
                const relAlias = `__${[...pathToEntity, col.propertyName].join('_')}__`;
                joinArr.push({
                  path: `${alias}.${col.propertyName}`,
                  alias: relAlias,
                });
                const idColumn =
                  col.relationMetadata.inverseEntityMetadata.primaryColumns[0]
                    ?.propertyName || 'id';
                select.add(`${relAlias}.${idColumn}`);
              } else {
                select.add(`${alias}.${col.propertyName}`);
              }
            }
          }
        }
      }
    }

    return {
      select: Array.from(select),
      joinArr,
      where,
      params: whereParams,
    };
  }

  private getMetadataByPath(
    pathParts: string[],
    rootMetadata: EntityMetadata,
  ): EntityMetadata | null {
    let currentMetadata = rootMetadata;
    for (const part of pathParts) {
      const rel = currentMetadata.relations.find(
        (r) => r.propertyName === part,
      );
      if (!rel) return null;
      currentMetadata = rel.inverseEntityMetadata;
    }
    return currentMetadata;
  }

  private collapseIdOnlyFields(obj: any): any {
    if (obj instanceof Date) {
      return obj; // ✅ preserve Date
    }

    if (Array.isArray(obj)) {
      const collapsed = obj.map(this.collapseIdOnlyFields);

      // Nếu toàn bộ phần tử là object có đúng { id: ... }
      const isAllIdObjects = collapsed.every(
        (item) =>
          typeof item === 'object' &&
          item !== null &&
          !Array.isArray(item) &&
          Object.keys(item).length === 1 &&
          (typeof item.id === 'number' || typeof item.id === 'string'),
      );

      if (isAllIdObjects) {
        return collapsed.map((item) => item.id);
      }

      return collapsed;
    }

    if (obj !== null && typeof obj === 'object' && !Array.isArray(obj)) {
      const keys = Object.keys(obj);

      // Nếu là object chỉ chứa { id: number | string }
      if (
        keys.length === 1 &&
        keys[0] === 'id' &&
        (typeof obj.id === 'number' || typeof obj.id === 'string')
      ) {
        return obj.id;
      }

      // Deep merge các field
      const result: Record<string, any> = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.collapseIdOnlyFields(value);
      }

      return result;
    }

    return obj; // primitive
  }

  async dynamicFind({
    fields,
    tableName,
    filter,
  }: {
    fields: string[] | string;
    tableName: string;
    filter?: any;
  }) {
    const repo = this.dataSourceService.getRepository(tableName);
    const extract = this.extractRelationsAndFieldsAndWhere({
      fields,
      filter,
      tableName,
    });
    const qb = repo.createQueryBuilder(tableName);
    qb.select(extract.select);

    for (const join of extract.joinArr) {
      qb.leftJoin(join.path, join.alias);
    }

    qb.where(extract.where).setParameters(extract.params);

    const result = await qb.getMany();
    return this.collapseIdOnlyFields(result);
  }
}
