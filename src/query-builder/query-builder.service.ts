import { Injectable } from '@nestjs/common';
import { Brackets, EntityMetadata } from 'typeorm';
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
    aggregate = {},
  }: {
    fields: string[] | string;
    tableName: string;
    filter?: any;
    aggregate?: Partial<
      Record<
        'count' | 'sum' | 'avg' | 'min' | 'max',
        string | { field: string; condition?: any }
      >
    >;
  }): Promise<{
    select: string[];
    joinArr: { path: string; alias: string }[];
    where: Brackets;
    params: Record<string, any>;
    requestedFields: Set<string>;
    aggregates: Record<
      string,
      {
        fn: string;
        alias: string;
        column: string;
        condition?: Brackets;
        params?: Record<string, any>;
      }
    >;
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

    const aggregates: Record<
      string,
      {
        fn: string;
        alias: string;
        column: string;
        condition?: Brackets;
        params?: Record<string, any>;
      }
    > = {};

    if (aggregate) {
      for (const [fn, raw] of Object.entries(aggregate)) {
        let rawField = '';
        let condition: any = undefined;

        if (typeof raw === 'string') {
          rawField = raw;
        } else if (typeof raw === 'object' && raw?.field) {
          rawField = raw.field;
          condition = raw.condition;
        } else {
          continue;
        }

        const parts = rawField.split('.');
        const column = parts.pop()!;
        const relationPath = parts;

        if (relationPath.length) {
          resolveRelationPath(relationPath, rootMeta);
        }

        const alias = aliasMap.get(relationPath.join('.')) || rootAlias;
        const targetMeta =
          this.getMetadataByPath(relationPath, rootMeta) || rootMeta;
        const colMeta = targetMeta.columns.find(
          (c) => c.propertyName === column,
        );

        if (!colMeta) {
          throw new Error(`Aggregate field not found: ${rawField}`);
        }

        const validTypes = [
          'int',
          'integer',
          'float',
          'double',
          'decimal',
          'numeric',
          'real',
          'date',
          'datetime',
          'timestamp',
        ];
        const fnLower = fn.toLowerCase();

        if (
          fnLower !== 'count' &&
          !validTypes.includes((colMeta.type as string).toLowerCase())
        ) {
          throw new Error(
            `Cannot apply aggregate '${fn}' on field '${rawField}' of type '${colMeta.type}'`,
          );
        }

        const aggItem: (typeof aggregates)[string] = {
          fn,
          alias,
          column,
        };

        if (condition) {
          const conditionParams: Record<string, any> = {};
          const bracket = new Brackets((qb) => {
            walkFilter(condition, [], rootMeta, 'and', qb, conditionParams);
          });

          aggItem.condition = bracket;
          aggItem.params = conditionParams;
        }

        aggregates[fn] = aggItem;
      }
    }

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
              walkFilter(
                value,
                path,
                currentMeta,
                'and',
                subQb,
                params,
                !negate,
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

          resolveRelationPath(newPath, currentMeta);

          // Xử lý _count trên quan hệ
          if (
            typeof value === 'object' &&
            value !== null &&
            '_count' in value
          ) {
            const alias = `sub_${params.__countAlias || 0}`;
            const countAliasIndex = params.__countAlias || 0;
            params.__countAlias = countAliasIndex + 1;

            const inverseTable = rel.inverseEntityMetadata.tableName;
            const inverseKey =
              rel.inverseEntityMetadata.primaryColumns[0]?.propertyName || 'id';
            const joinKey = rel.inverseRelation?.joinColumns?.[0]?.databaseName;
            if (!joinKey)
              throw new Error(`Missing join key for relation '${key}'`);

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
              qb[method](
                `${mainId} ${negate ? 'NOT IN' : 'IN'} ${wrappedSubquery}`,
              );
            }

            continue;
          }

          // Quan hệ lồng nhau
          walkFilter(
            value,
            newPath,
            rel.inverseEntityMetadata,
            'and',
            qb,
            params,
            negate,
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
            if (op === '_in' || op === '_nin') {
              val = parseArray(val);
            }

            if (
              ['_contains', '_starts_with', '_ends_with', '_like'].includes(op)
            ) {
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
      aggregates,
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
    sort,
    aggregate,
  }: {
    fields: string[] | string;
    tableName: string;
    filter?: any;
    page: number;
    limit: number;
    meta?: 'filterCount' | 'totalCount' | '*' | undefined;
    sort?: string | string[];
    aggregate?: Partial<
      Record<'count' | 'sum' | 'avg' | 'min' | 'max', string>
    >;
  }) {
    const repo = await this.dataSourceService.getRepository(tableName);

    const sortFields = Array.isArray(sort)
      ? sort
      : typeof sort === 'string'
        ? sort
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [];

    const extraJoins: { path: string; alias: string }[] = [];

    for (const sortField of sortFields) {
      const rawPath = sortField.startsWith('-')
        ? sortField.slice(1)
        : sortField;
      const parts = rawPath.split('.');
      if (parts.length <= 1) continue;

      for (let i = 1; i < parts.length; i++) {
        const relPath = parts.slice(0, i).join('.');
        const parentPath = parts.slice(0, i - 1).join('.');
        const alias = relPath;
        const parentAlias = parentPath || tableName;

        if (!extraJoins.some((j) => j.alias === alias)) {
          extraJoins.push({ path: `${parentAlias}.${parts[i - 1]}`, alias });
        }
      }
    }

    const extract = await this.extractRelationsAndFieldsAndWhere({
      fields,
      filter,
      tableName,
      aggregate,
    });

    const allJoins = [
      ...extract.joinArr,
      ...extraJoins.filter(
        (ej) => !extract.joinArr.some((j) => j.alias === ej.alias),
      ),
    ];

    const qb = repo.createQueryBuilder(tableName);

    for (const join of allJoins) {
      qb.leftJoin(join.path, join.alias);
    }

    qb.select(extract.select);
    qb.where(extract.where).setParameters(extract.params);

    for (const sortField of sortFields) {
      const order: 'ASC' | 'DESC' = sortField.startsWith('-') ? 'DESC' : 'ASC';
      const fieldPath = sortField.replace(/^-/, '').trim();
      const parts = fieldPath.split('.');
      const aliasPath = parts.slice(0, -1).join('.');
      const columnName = parts.at(-1)!;
      const alias = aliasPath || tableName;

      qb.addOrderBy(`${alias}.${columnName}`, order);
    }

    qb.skip((page - 1) * limit);
    qb.take(limit);

    const result = await qb.getMany();
    const obj: any = {
      data: this.collapseIdOnlyFields(result, extract.requestedFields),
    };

    if (aggregate && Object.keys(extract.aggregates).length > 0) {
      const aggQb = repo.createQueryBuilder(tableName);
      for (const join of allJoins) {
        aggQb.leftJoin(join.path, join.alias);
      }

      aggQb.where(extract.where).setParameters(extract.params);

      for (const [fn, { alias, column, condition, params }] of Object.entries(
        extract.aggregates,
      )) {
        const fnUpper = fn.toUpperCase();

        if (condition) {
          const subQb = repo.createQueryBuilder('sub');
          subQb.where(condition).setParameters(params || {});

          const condSql = subQb.expressionMap.wheres
            .map((w) => w.condition)
            .join(' AND ');

          aggQb.addSelect(`SUM(CASE WHEN ${condSql} THEN 1 ELSE 0 END)`, fn);
          if (params) {
            aggQb.setParameters(params);
          }
        } else {
          aggQb.addSelect(`${fnUpper}(${alias}.${column})`, fn);
        }
      }

      const aggResult = await aggQb.getRawOne();
      obj.meta = {
        ...(obj.meta || {}),
        aggregate: aggResult,
      };
    }

    if (meta) {
      const metaObj: Record<string, any> = obj.meta || {};

      if (meta === 'filterCount' || meta === '*') {
        const filterQb = repo.createQueryBuilder(tableName);
        for (const join of allJoins) {
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
