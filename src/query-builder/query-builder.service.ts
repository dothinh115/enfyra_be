import { Injectable } from '@nestjs/common';
import { Brackets, EntityMetadata, SelectQueryBuilder } from 'typeorm';
import { DataSourceService } from '../data-source/data-source.service';

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
export class QueryBuilderService {
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
    requestedFields: Set<string>;
  }> {
    const dataSource = this.dataSourceService.getDataSource();
    fields =
      typeof fields === 'string'
        ? fields
            .split(',')
            .map((f) => f.trim())
            .filter(Boolean)
        : fields;

    const requestedFields = new Set(fields);
    const rootAlias = tableName;
    const aliasMap = new Map<string, string>();
    const joinSet = new Set<string>();
    const select = new Set<string>();
    aliasMap.set('', rootAlias);

    const rootMeta = dataSource.entityMetadatas.find(
      (m) => m.tableName === tableName,
    );
    if (!rootMeta) throw new Error(`Entity not found: ${tableName}`);

    function resolveRelationPath(path: string[], meta: EntityMetadata) {
      for (let i = 0; i < path.length; i++) {
        const fullPath = path.slice(0, i + 1).join('.');
        const parentPath = path.slice(0, i).join('.');
        const parentAlias = aliasMap.get(parentPath) || rootAlias;
        const part = path[i];
        const alias = fullPath;

        if (!aliasMap.has(fullPath)) {
          joinSet.add(`${parentAlias}.${part}|${alias}`);
          aliasMap.set(fullPath, alias);
        }

        const rel = meta.relations.find((r) => r.propertyName === part);
        if (!rel) break;
        meta = rel.inverseEntityMetadata;

        const idCol = meta.primaryColumns[0]?.propertyName || 'id';
        select.add(`${alias}.${idCol}`);
      }
    }

    function selectAllFieldsForEntity(meta: EntityMetadata, path: string[]) {
      const alias = aliasMap.get(path.join('.')) || rootAlias;
      for (const col of meta.columns) {
        if (!col.relationMetadata) {
          select.add(`${alias}.${col.propertyName}`);
        } else {
          const relPath = [...path, col.propertyName];
          resolveRelationPath(relPath, meta);
        }
      }
    }

    if (!fields.length || (fields.length === 1 && fields[0] === '*')) {
      for (const col of rootMeta.columns) {
        if (!col.relationMetadata) {
          select.add(`${rootAlias}.${col.propertyName}`);
        }
      }
      for (const rel of rootMeta.relations) {
        const relPath = [rel.propertyName];
        resolveRelationPath(relPath, rootMeta);
      }
    } else {
      for (const rawField of fields) {
        const parts = rawField.split('.');
        const isWildcard = parts.at(-1) === '*';
        const isRelationOnly = parts.length === 1;
        const relationExists = rootMeta.relations.some(
          (r) => r.propertyName === parts[0],
        );

        const pathToEntity = isWildcard
          ? parts.slice(0, -1)
          : isRelationOnly && relationExists
            ? parts
            : parts.slice(0, -1);

        if (pathToEntity.length) {
          resolveRelationPath(pathToEntity, rootMeta);
        }

        const alias = aliasMap.get(pathToEntity.join('.')) || rootAlias;

        if (isWildcard) {
          const targetMeta = this.getMetadataByPath(pathToEntity, rootMeta);
          if (targetMeta) {
            selectAllFieldsForEntity(targetMeta, pathToEntity);
          }
        } else if (isRelationOnly && relationExists) {
          const rel = rootMeta.relations.find(
            (r) => r.propertyName === parts[0],
          );
          if (rel) {
            resolveRelationPath(parts, rootMeta);
          }
        } else {
          select.add(`${alias}.${parts.at(-1)}`);
        }
      }
    }

    const whereParams: Record<string, any> = {};
    const where = new Brackets((qb) => {
      if (filter) {
        walkFilter(filter, [], rootMeta, 'and', qb, whereParams);
      }
    });

    function parseArray(val: any): any[] {
      if (typeof val === 'string') {
        try {
          val = JSON.parse(val);
        } catch {
          val = val.split(',').map((v) => v.trim());
        }
      }
      return Array.isArray(val) ? val : [val];
    }

    function walkFilter(
      obj: any,
      path: string[],
      currentMeta: EntityMetadata,
      type: 'and' | 'or',
      qb: any,
      params: Record<string, any>,
      negate = false,
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
                );
              }
            }),
          );
          continue;
        }

        if (key === '_not') {
          qb[method](
            new Brackets((subQb) => {
              walkFilter(value, path, currentMeta, 'and', subQb, params, true);
            }),
          );
          continue;
        }

        const rel = currentMeta.relations.find((r) => r.propertyName === key);
        if (rel) {
          const newPath = [...path, key];
          resolveRelationPath(newPath, currentMeta);

          if (
            typeof value === 'object' &&
            value !== null &&
            '_count' in value
          ) {
            const alias = `sub_${params.__countAlias || 0}`;
            params.__countAlias = (params.__countAlias || 0) + 1;
            const inverseTable = rel.inverseEntityMetadata.tableName;
            const inverseKey =
              rel.inverseEntityMetadata.primaryColumns[0]?.propertyName || 'id';
            const joinKey = rel.inverseRelation?.joinColumns?.[0]?.databaseName;
            if (!joinKey) continue;

            for (const op in value._count) {
              const sqlOp = OPERATOR_MAP[op];
              if (!sqlOp) continue;
              const paramKey = `count_${params.__countAlias || 0}_${Object.keys(params).length}`;
              const val = value._count[op];
              params[paramKey] = val;

              const subquery = `SELECT ${alias}.${joinKey} FROM ${inverseTable} ${alias} GROUP BY ${alias}.${joinKey} HAVING COUNT(DISTINCT ${alias}.${inverseKey}) ${sqlOp} :${paramKey}`;
              const mainId =
                rootAlias + '.' + currentMeta.primaryColumns[0].propertyName;
              qb[method](`${mainId} ${negate ? 'NOT IN' : 'IN'} (${subquery})`);
            }
          } else if (
            typeof value === 'object' &&
            value !== null &&
            '_eq_set' in value
          ) {
            const paramKey = `eqset_${params.__eqsetAlias || 0}_${Object.keys(params).length}`;
            params.__eqsetAlias = (params.__eqsetAlias || 0) + 1;
            const ids = parseArray(value._eq_set);
            params[paramKey] = ids;
            const alias = aliasMap.get(newPath.join('.'));
            const idCol =
              rel.inverseEntityMetadata.primaryColumns[0]?.propertyName || 'id';
            if (!alias) continue;

            if (negate) {
              qb[method](
                new Brackets((b) => {
                  b.where(`${alias}.${idCol} IS NULL`).orWhere(
                    `${alias}.${idCol} NOT IN (:...${paramKey})`,
                  );
                }),
              );
            } else {
              qb[method](`${alias}.${idCol} IN (:...${paramKey})`);
            }
          } else {
            walkFilter(
              value,
              newPath,
              rel.inverseEntityMetadata,
              'and',
              qb,
              params,
              negate,
            );
          }
          continue;
        }

        const column = currentMeta.columns.find((c) => c.propertyName === key);
        if (!column) continue;

        const fieldPath = [...path].join('.');
        const alias = aliasMap.get(fieldPath) || rootAlias;
        const field = `${alias}.${key}`;

        if (typeof value === 'object' && value !== null) {
          for (const op in value) {
            const sqlOp = OPERATOR_MAP[op];
            if (!sqlOp) continue;

            const paramKey = `${key}_${Object.keys(params).length}`;
            let val = value[op];

            if (op === '_in' || op === '_nin') {
              val = parseArray(val);
            }

            if (op === '_contains') {
              val = `%${val}%`;
              qb[method](
                negate
                  ? `NOT (unaccent(${field}) LIKE unaccent(:${paramKey}))`
                  : `unaccent(${field}) LIKE unaccent(:${paramKey})`,
                { [paramKey]: val },
              );
              params[paramKey] = val;
              continue;
            }

            if (op === '_starts_with') {
              val = `${val}%`;
              qb[method](
                negate
                  ? `NOT (unaccent(${field}) LIKE unaccent(:${paramKey}))`
                  : `unaccent(${field}) LIKE unaccent(:${paramKey})`,
                { [paramKey]: val },
              );
              params[paramKey] = val;
              continue;
            }

            if (op === '_ends_with') {
              val = `%${val}`;
              qb[method](
                negate
                  ? `NOT (unaccent(${field}) LIKE unaccent(:${paramKey}))`
                  : `unaccent(${field}) LIKE unaccent(:${paramKey})`,
                { [paramKey]: val },
              );
              params[paramKey] = val;
              continue;
            }

            if (op === '_like') {
              qb[method](
                negate
                  ? `NOT (unaccent(${field}) LIKE unaccent(:${paramKey}))`
                  : `unaccent(${field}) LIKE unaccent(:${paramKey})`,
                { [paramKey]: val },
              );
              params[paramKey] = val;
              continue;
            }

            if (sqlOp === 'IN' || sqlOp === 'NOT IN') {
              qb[method](
                negate
                  ? `NOT (${field} ${sqlOp} (:...${paramKey}))`
                  : `${field} ${sqlOp} (:...${paramKey})`,
                { [paramKey]: val },
              );
            } else if (op === '_is_null') {
              qb[method](
                negate
                  ? `NOT (${field} IS ${val ? '' : 'NOT '}NULL)`
                  : `${field} IS ${val ? '' : 'NOT '}NULL`,
              );
            } else {
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
            negate
              ? `NOT (${field} = :${paramKey})`
              : `${field} = :${paramKey}`,
            { [paramKey]: value },
          );
          params[paramKey] = value;
        }
      }
    }

    const joinArr = Array.from(joinSet).map((str) => {
      const [path, alias] = str.split('|');
      return { path, alias };
    });

    const rootIdCol = rootMeta.primaryColumns[0]?.propertyName || 'id';
    select.add(`${rootAlias}.${rootIdCol}`);

    return {
      select: Array.from(select),
      joinArr,
      where,
      params: whereParams,
      requestedFields,
    };
  }

  private getMetadataByPath(
    pathParts: string[],
    rootMetadata: EntityMetadata,
  ): EntityMetadata | null {
    let current = rootMetadata;
    for (const part of pathParts) {
      const rel = current.relations.find((r) => r.propertyName === part);
      if (!rel) return null;
      current = rel.inverseEntityMetadata;
    }
    return current;
  }

  private collapseIdOnlyFields(
    obj: any,
    requestedFields: Set<string>,
    parentPath = '',
  ): any {
    if (obj instanceof Date) return obj;

    if (Array.isArray(obj)) {
      const collapsed = obj.map((item) =>
        this.collapseIdOnlyFields(item, requestedFields, parentPath),
      );

      const isAllIdObjects = collapsed.every(
        (item) =>
          typeof item === 'object' &&
          item !== null &&
          !Array.isArray(item) &&
          Object.keys(item).length === 1 &&
          (typeof item.id === 'number' || typeof item.id === 'string'),
      );

      const idFieldPath = parentPath ? `${parentPath}.id` : 'id';
      const shouldCollapse =
        !requestedFields.has(idFieldPath) &&
        !requestedFields.has(`${parentPath}.*`);

      return isAllIdObjects && shouldCollapse
        ? collapsed.map((item) => item.id)
        : collapsed;
    }

    if (obj !== null && typeof obj === 'object' && !Array.isArray(obj)) {
      const keys = Object.keys(obj);
      const idFieldPath = parentPath ? `${parentPath}.id` : 'id';

      const shouldCollapse =
        keys.length === 1 &&
        keys[0] === 'id' &&
        (typeof obj.id === 'string' || typeof obj.id === 'number') &&
        !requestedFields.has(idFieldPath) &&
        !requestedFields.has(`${parentPath}.*`);

      if (shouldCollapse) {
        return obj.id;
      }

      const result: Record<string, any> = {};
      for (const [key, value] of Object.entries(obj)) {
        const newPath = parentPath ? `${parentPath}.${key}` : key;
        result[key] = this.collapseIdOnlyFields(
          value,
          requestedFields,
          newPath,
        );
      }
      return result;
    }

    return obj;
  }

  async find({
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

    for (const join of extract.joinArr) {
      qb.leftJoin(join.path, join.alias);
    }
    qb.select(extract.select);
    qb.where(extract.where).setParameters(extract.params);

    // ✅ Pagination
    qb.skip((page - 1) * limit);
    qb.take(limit);

    const result = await qb.getMany();
    const obj: any = {
      data: this.collapseIdOnlyFields(result, extract.requestedFields),
    };

    if (meta) {
      const metaObj: Record<string, any> = {};

      if (meta === 'filterCount' || meta === '*') {
        const filterQb = repo.createQueryBuilder(tableName);
        for (const join of extract.joinArr) {
          filterQb.leftJoin(join.path, join.alias);
        }
        filterQb.where(extract.where).setParameters(extract.params);
        metaObj.filterCount = await filterQb.getCount();
      }

      if (meta === 'totalCount' || meta === '*') {
        metaObj.totalCount = await repo.count();
      }
      obj.meta = metaObj;
    }

    return obj;
  }
}
