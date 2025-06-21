import { Injectable } from '@nestjs/common';
import { Brackets, EntityMetadata } from 'typeorm';
import { DataSourceService } from '../data-source/data-source.service';
import { walkFilter } from './utils/walk-filter';
import { resolveRelationPath } from './utils/resolve-relation-path';
import { collapseIdOnlyFields } from './utils/collapse-id';

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
          resolveRelationPath(
            relationPath,
            rootMeta,
            rootAlias,
            aliasMap,
            joinSet,
            select,
          );
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
            walkFilter(
              condition,
              [],
              rootMeta,
              'and',
              qb,
              conditionParams,
              false,
              rootAlias,
              aliasMap,
              joinSet,
              select,
            );
          });

          aggItem.condition = bracket;
          aggItem.params = conditionParams;
        }

        aggregates[fn] = aggItem;
      }
    }

    function selectAllFieldsForEntity(
      meta: EntityMetadata,
      path: string[],
      depth = 1,
    ) {
      const alias = aliasMap.get(path.join('.')) || rootAlias;

      // Pick all scalar fields
      for (const col of meta.columns) {
        if (!col.relationMetadata) {
          select.add(`${alias}.${col.propertyName}`);
        }
      }

      // Pick ID of direct relations
      if (depth > 0) {
        for (const rel of meta.relations) {
          const relPath = [...path, rel.propertyName];

          // 👇 Fix: always resolve path from rootMeta, not current meta
          resolveRelationPath(
            relPath,
            rootMeta,
            rootAlias,
            aliasMap,
            joinSet,
            select,
          );

          const relAlias = aliasMap.get(relPath.join('.'));
          const relMeta = rel.inverseEntityMetadata;
          const idCol = relMeta.primaryColumns[0]?.propertyName || 'id';

          if (relAlias) {
            select.add(`${relAlias}.${idCol}`);
          } else {
            console.warn(
              `⚠️ Alias not found for ${relPath.join('.')}, skipping`,
            );
          }
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
        resolveRelationPath(
          relPath,
          rootMeta,
          rootAlias,
          aliasMap,
          joinSet,
          select,
        );

        const relAlias = aliasMap.get(relPath.join('.'));
        const relMeta = rel.inverseEntityMetadata;
        const idCol = relMeta.primaryColumns[0]?.propertyName || 'id';

        if (relAlias) {
          select.add(`${relAlias}.${idCol}`);
        }
      }
    } else {
      for (const rawField of fields) {
        const parts = rawField.split('.');
        const isWildcard = parts.at(-1) === '*';

        for (let depth = 1; depth <= parts.length; depth++) {
          const pathToEntity = parts.slice(0, depth - 1);
          const currentField = parts[depth - 1];

          const currentMeta = this.getMetadataByPath(pathToEntity, rootMeta);
          if (!currentMeta) break;

          const alias = aliasMap.get(pathToEntity.join('.')) || rootAlias;

          const rel = currentMeta.relations.find(
            (r) => r.propertyName === currentField,
          );

          if (rel) {
            resolveRelationPath(
              [...pathToEntity, currentField],
              rootMeta,
              rootAlias,
              aliasMap,
              joinSet,
              select,
            );
          }

          if (depth === parts.length) {
            if (isWildcard) {
              const targetMeta = this.getMetadataByPath(
                parts.slice(0, -1),
                rootMeta,
              );
              if (targetMeta) {
                selectAllFieldsForEntity(targetMeta, parts.slice(0, -1), 1);
              }
            } else if (rel) {
              const relAlias = aliasMap.get(
                [...pathToEntity, currentField].join('.'),
              );
              const idCol =
                rel.inverseEntityMetadata.primaryColumns[0]?.propertyName ||
                'id';
              if (relAlias) {
                select.add(`${relAlias}.${idCol}`);
              }
            } else {
              select.add(`${alias}.${currentField}`);
            }
          }
        }
      }
    }

    const whereParams: Record<string, any> = {};
    const where = new Brackets((qb) => {
      if (filter) {
        walkFilter(
          filter,
          [],
          rootMeta,
          'and',
          qb,
          whereParams,
          false,
          rootAlias,
          aliasMap,
          joinSet,
          select,
        );
      }
    });

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
    const repo = this.dataSourceService.getRepository(tableName);
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
    if (limit !== 0) {
      qb.take(limit);
    }
    const result = await qb.getMany();
    const obj: any = {
      data: collapseIdOnlyFields(result, extract.requestedFields),
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
        const currentMeta = this.dataSourceService
          .getDataSource()
          .getMetadata(tableName);
        const countQb = qb
          .clone()
          .select(
            'COUNT(DISTINCT ' +
              tableName +
              '.' +
              currentMeta.primaryColumns[0].propertyName +
              ')',
            'cnt',
          );

        const countResult = await countQb.getRawOne();
        metaObj.filterCount = Number(countResult?.cnt ?? 0);
      }

      if (meta === 'totalCount' || meta === '*') {
        metaObj.totalCount = await repo.count();
      }

      obj.meta = metaObj;
    }
    return obj;
  }
}
