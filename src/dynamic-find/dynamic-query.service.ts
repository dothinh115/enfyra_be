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
  _starts_with: 'LIKE',
  _ends_with: 'LIKE',
  _contains: 'LIKE',
  _is_null: 'IS NULL',
};

@Injectable()
export class DynamicQueryService {
  constructor(private dataSourceService: DataSourceService) {}

  private async extractRelationsAndFieldsAndWhere({
    fields,
    tableName,
    filter = {},
  }: {
    fields: string[] | string;
    tableName: string;
    filter?: any;
  }): Promise<{
    select: string[];
    joinArr: { path: string; alias: string }[];
    where: Brackets;
    params: Record<string, any>;
  }> {
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
      if (filter) walkFilter(filter, [], rootMetadata, 'and', qb, whereParams);
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

    // ✅ Helper để đảm bảo key param an toàn
    function safeKey(...parts: (string | number)[]): string {
      return parts.map((p) => String(p).replace(/[^a-zA-Z0-9]/g, '')).join('');
    }

    function walkFilter(
      obj: any,
      path: string[] = [],
      currentMeta: EntityMetadata,
      type: 'and' | 'or' = 'and',
      qb?: any,
      whereParams: Record<string, any> = {},
      negate = false,
    ) {
      const method = type === 'and' ? 'andWhere' : 'orWhere';

      function parseValue(raw: any, fieldType: string): any {
        if (typeof raw === 'string' && raw.trim().startsWith('[')) {
          try {
            raw = JSON.parse(raw);
          } catch {}
        }

        if (Array.isArray(raw)) {
          return raw
            .map((v) => {
              if (fieldType === 'uuid' || fieldType === 'varchar')
                return String(v).trim();
              if (['int', 'integer', 'number'].includes(fieldType))
                return Number(v);
              return v;
            })
            .filter((v) => v !== undefined && v !== null && v !== '');
        } else {
          if (fieldType === 'uuid' || fieldType === 'varchar')
            return String(raw).trim();
          if (['int', 'integer', 'number'].includes(fieldType))
            return Number(raw);
          return raw;
        }
      }

      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;

      if ('_not' in obj) {
        const lastKey = path.at(-1);
        const rel = currentMeta.relations.find(
          (r) => r.propertyName === lastKey,
        );
        let nextMeta = currentMeta;
        let nextPath = path;

        if (rel) {
          nextMeta = rel.inverseEntityMetadata;
          nextPath = [...path];
          resolveRelationPath(nextPath, currentMeta);
        }

        const notTarget = obj['_not'];
        if (
          typeof notTarget === 'object' &&
          notTarget !== null &&
          '_eq_set' in notTarget &&
          Object.keys(notTarget).length === 1
        ) {
          obj['_not'] = { id: notTarget };
        }

        qb?.[method](
          new Brackets((subQb) => {
            walkFilter(
              obj['_not'],
              nextPath,
              nextMeta,
              'and',
              subQb,
              whereParams,
              true,
            );
          }),
        );
        return;
      }

      for (const key in obj) {
        let value = obj[key];

        if (key === 'and' || key === 'or') {
          qb?.[method](
            new Brackets((subQb) => {
              for (const sub of value) {
                walkFilter(
                  sub,
                  path,
                  currentMeta,
                  key as 'and' | 'or',
                  subQb,
                  whereParams,
                  negate,
                );
              }
            }),
          );
          continue;
        }

        const rel = currentMeta.relations.find((r) => r.propertyName === key);

        if (
          rel &&
          typeof value === 'object' &&
          value !== null &&
          '_count' in value &&
          typeof value._count === 'object'
        ) {
          const countConditions = value._count;
          const subAlias = `sub_${paramCounter++}`;
          const inverseTable = rel.inverseEntityMetadata.tableName;
          const inverseKey =
            rel.inverseEntityMetadata.primaryColumns[0]?.propertyName || 'id';
          const relationKey =
            rel.inverseRelation?.joinColumns?.[0]?.databaseName;
          if (!relationKey) continue;

          for (const op in countConditions) {
            const operator = OPERATOR_MAP[op];
            if (!operator) continue;

            const paramName = safeKey('count', path.join('_'), paramCounter++);
            const val = countConditions[op];
            whereParams[paramName] = val;

            const subquery = `
          SELECT ${subAlias}.${relationKey}
          FROM ${inverseTable} ${subAlias}
          GROUP BY ${subAlias}.${relationKey}
          HAVING COUNT(DISTINCT ${subAlias}.${inverseKey}) ${operator} :${paramName}
        `;

            const outer = `${rootAlias}.id ${negate ? 'NOT IN' : 'IN'} (${subquery})`;
            qb?.[method](outer);
          }
          continue;
        }

        if (
          rel &&
          typeof value === 'object' &&
          value !== null &&
          Object.keys(value).every(
            (op) => op in OPERATOR_MAP || op === '_eq_set',
          )
        ) {
          value = { id: value };
        }

        if (
          rel &&
          typeof value === 'object' &&
          value !== null &&
          '_eq_set' in value &&
          Object.keys(value).length === 1
        ) {
          value = { id: value };
        }

        if (rel) {
          const newPath = [...path, key];
          resolveRelationPath(newPath, currentMeta);
          walkFilter(
            value,
            newPath,
            rel.inverseEntityMetadata,
            'and',
            qb,
            whereParams,
            negate,
          );
          continue;
        }

        const column = currentMeta.columns.find((c) => c.propertyName === key);
        if (!column) {
          console.warn(
            `⛔ Field "${key}" not in table "${currentMeta.tableName}", skipping`,
          );
          continue;
        }

        const fieldAlias = aliasMap.get(path.join('.')) || rootAlias;
        const field = `${fieldAlias}.${key}`;

        let fieldType = 'varchar';
        if (typeof column.type === 'string') {
          fieldType = column.type.toLowerCase();
        } else if (typeof column.type === 'function') {
          const name = column.type.name.toLowerCase();
          if (name.includes('number')) fieldType = 'number';
          else if (name.includes('uuid')) fieldType = 'uuid';
          else if (name.includes('string')) fieldType = 'varchar';
          else if (name.includes('boolean')) fieldType = 'boolean';
        }

        if (typeof value === 'object' && '_eq_set' in value) {
          const exactIds = parseValue(value['_eq_set'], fieldType);
          if (!Array.isArray(exactIds) || !exactIds.length) return;

          const paramName = safeKey('eqset', key, paramCounter++);
          whereParams[paramName] = exactIds;

          if (negate) {
            qb?.[method](
              new Brackets((qb1) => {
                qb1
                  .where(`${field} IS NULL`)
                  .orWhere(`${field} NOT IN (:...${paramName})`);
              }),
            );
          } else {
            qb?.[method](`${field} IN (:...${paramName})`);
          }

          continue;
        }

        if (typeof value === 'object' && value !== null) {
          for (const op in value) {
            const operator = OPERATOR_MAP[op];
            if (!operator) continue;

            const paramName = safeKey('param', key, paramCounter++);
            let finalValue = parseValue(value[op], fieldType);

            if (op === '_is_null') {
              const cond = `${field} IS ${finalValue ? '' : 'NOT '}NULL`;
              qb?.[method](negate ? `NOT (${cond})` : cond);
              continue;
            }

            if (op === '_in' || op === '_nin') {
              if (!Array.isArray(finalValue)) continue;
              const cond = `${field} ${operator} (:...${paramName})`;
              qb?.[method](negate ? `NOT (${cond})` : cond, {
                [paramName]: finalValue,
              });
              whereParams[paramName] = finalValue;
              continue;
            }

            if (op === '_starts_with') finalValue = `${finalValue}%`;
            if (op === '_ends_with') finalValue = `%${finalValue}`;
            if (op === '_contains' || op === '_like')
              finalValue = `%${finalValue}%`;

            const isText = [
              '_like',
              '_starts_with',
              '_ends_with',
              '_contains',
            ].includes(op);
            const cond = isText
              ? `unaccent(${field}) ${operator} unaccent(:${paramName})`
              : `${field} ${operator} :${paramName}`;

            qb?.[method](negate ? `NOT (${cond})` : cond, {
              [paramName]: finalValue,
            });
            whereParams[paramName] = finalValue;
          }
        }
      }
    }

    if (!fields.length || (fields.length === 1 && fields[0] === '*')) {
      for (const column of rootMetadata.columns) {
        if (!column.relationMetadata) {
          select.add(`${rootAlias}.${column.propertyName}`);
        }
      }

      for (const rel of rootMetadata.relations) {
        const alias = `__${rel.propertyName}__`;
        if (!aliasMap.has(rel.propertyName)) {
          aliasMap.set(rel.propertyName, alias);
          joinArr.push({ path: `${rootAlias}.${rel.propertyName}`, alias });
        }
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
          const pathStr = pathToEntity.join('.');
          const alias = aliasMap.get(pathStr);
          const targetMeta = this.getMetadataByPath(pathToEntity, rootMetadata);

          if (targetMeta && alias) {
            for (const col of targetMeta.columns) {
              const fullRelPath = [...pathToEntity, col.propertyName].join('.');
              if (col.relationMetadata) {
                const relAlias = `__${fullRelPath.replace(/\./g, '_')}__`;
                if (!aliasMap.has(fullRelPath)) {
                  aliasMap.set(fullRelPath, relAlias);
                  joinArr.push({
                    path: `${alias}.${col.propertyName}`,
                    alias: relAlias,
                  });
                }
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
    if (obj instanceof Date) return obj;
    if (Array.isArray(obj)) {
      const collapsed = obj.map((item) => this.collapseIdOnlyFields(item));
      const isAllIdObjects = collapsed.every(
        (item) =>
          typeof item === 'object' &&
          item !== null &&
          !Array.isArray(item) &&
          Object.keys(item).length === 1 &&
          (typeof item.id === 'number' || typeof item.id === 'string'),
      );
      return isAllIdObjects ? collapsed.map((item) => item.id) : collapsed;
    }
    if (obj !== null && typeof obj === 'object' && !Array.isArray(obj)) {
      const keys = Object.keys(obj);
      if (
        keys.length === 1 &&
        keys[0] === 'id' &&
        (typeof obj.id === 'number' || typeof obj.id === 'string')
      ) {
        return obj.id;
      }
      const result: Record<string, any> = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.collapseIdOnlyFields(value);
      }
      return result;
    }
    return obj;
  }

  async dynamicFind({
    fields,
    tableName,
    filter,
    page = 1,
    limit = 10,
    meta,
  }: {
    fields: string[] | string;
    tableName: string;
    filter?: any;
    page: number;
    limit: number;
    meta?: 'filterCount' | 'totalCount' | '*' | undefined;
  }) {
    const repo = await this.dataSourceService.getRepository(tableName);
    const extract = await this.extractRelationsAndFieldsAndWhere({
      fields,
      filter,
      tableName,
    });
    const qb = repo.createQueryBuilder(tableName);

    console.log('✅ SQL preview:', qb.getSql());
    console.log('✅ PARAMS:', extract.params);

    qb.select(extract.select);
    for (const join of extract.joinArr) {
      qb.leftJoin(join.path, join.alias);
    }
    console.log('🔍 extract.params:', extract.params);

    for (const key of Object.keys(extract.params)) {
      if (!/^[a-zA-Z0-9_.]+$/.test(key)) {
        console.warn('🚨 INVALID PARAM KEY:', key);
      }
    }

    qb.where(extract.where).setParameters(extract.params);
    qb.skip(limit * (page - 1));
    qb.take(limit);
    console.log(qb.getSql());
    console.log('QB Params:', qb.getParameters());

    const result = await qb.getMany();

    const output: any = {
      data: this.collapseIdOnlyFields(result),
    };

    if (meta) {
      const metaObj: Record<string, any> = {};

      if (meta === 'filterCount' || meta === '*') {
        const filterCountQb = repo.createQueryBuilder(tableName);
        for (const join of extract.joinArr) {
          filterCountQb.leftJoin(join.path, join.alias);
        }
        filterCountQb.where(extract.where).setParameters(extract.params);
        const filterCount = await filterCountQb.getCount();
        metaObj.filterCount = filterCount;
      }

      if (meta === 'totalCount' || meta === '*') {
        metaObj.totalCount = await repo.count();
      }

      output.meta = metaObj;
    }

    return output;
  }
}
