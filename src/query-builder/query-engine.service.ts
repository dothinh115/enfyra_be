import { Injectable } from '@nestjs/common';
import { DataSourceService } from '../data-source/data-source.service';
import { Brackets, EntityMetadata } from 'typeorm';

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

@Injectable()
export class QueryEngine {
  private log: string[] = [];

  constructor(private dataSourceService: DataSourceService) {}

  async find(options: {
    tableName: string;
    fields?: string | string[];
    filter?: any;
    sort?: string | string[];
    page?: number;
    limit?: number;
    meta?: string;
    aggregate?: any;
  }): Promise<any> {
    const { tableName, fields, filter, sort, page, limit, meta } = options;
    const dataSource = this.dataSourceService.getDataSource();
    const metaData = dataSource.getMetadata(tableName);

    this.log = [];

    const { joinArr, selectArr, sortArr } = this.buildJoinTree({
      meta: metaData,
      fields,
      filter,
      sort,
      rootAlias: tableName,
    });

    const { parts } = this.walkFilter({
      filter,
      currentMeta: metaData,
      currentAlias: tableName,
    });

    const qb = dataSource.createQueryBuilder(metaData.target, tableName);

    for (const join of joinArr) {
      qb.leftJoinAndSelect(
        `${join.parentAlias}.${join.propertyPath}`,
        join.alias,
      );
    }

    qb.select([...selectArr]);

    if (parts.length > 0) {
      qb.where(
        new Brackets((qb2) => {
          for (const p of parts) {
            if (p.operator === 'AND') {
              qb2.andWhere(p.sql, p.params);
            } else {
              qb2.orWhere(p.sql, p.params);
            }
          }
        }),
      );
    }

    // for (const sort of sortArr) {
    //   qb.addOrderBy(`${sort.alias}.${sort.field}`, sort.direction);
    // }

    // === Xử lý meta ===
    const metaParts = (meta || '').split(',').map((x) => x.trim());
    let totalCount = 0;
    let filterCount = 0;

    // totalCount = full table
    if (metaParts.includes('totalCount') || metaParts.includes('*')) {
      totalCount = await dataSource
        .createQueryBuilder(metaData.target, tableName)
        .getCount();
      this.log.push(`+ totalCount = ${totalCount}`);
    }

    // filterCount = sau filter
    if (metaParts.includes('filterCount') || metaParts.includes('*')) {
      const filterQb = dataSource.createQueryBuilder(
        metaData.target,
        tableName,
      );

      if (parts.length > 0) {
        filterQb.where(
          new Brackets((qb2) => {
            for (const p of parts) {
              if (p.operator === 'AND') {
                qb2.andWhere(p.sql, p.params);
              } else {
                qb2.orWhere(p.sql, p.params);
              }
            }
          }),
        );
      }

      filterCount = await filterQb.getCount();
      this.log.push(`+ filterCount = ${filterCount}`);
    }

    // === paging ===
    if (limit) qb.take(limit);
    if (page && limit) qb.skip((page - 1) * limit);

    const rows = await qb.getMany();

    return {
      data: rows,
      ...(meta && {
        meta: {
          totalCount,
          filterCount,
        },
      }),
      // debug: {
      //   sql: qb.getSql(),
      //   select: selectArr,
      //   join: joinArr,
      //   log: this.log,
      // },
    };
  }

  private buildJoinTree({
    meta,
    fields,
    filter,
    sort,
    rootAlias,
  }: {
    meta: EntityMetadata;
    fields?: string | string[];
    filter?: any;
    sort?: string | string[];
    rootAlias: string;
  }): {
    joinArr: { alias: string; parentAlias: string; propertyPath: string }[];
    selectArr: string[];
    sortArr: { alias: string; field: string; direction: 'ASC' | 'DESC' }[];
  } {
    const joinArr: {
      alias: string;
      parentAlias: string;
      propertyPath: string;
    }[] = [];
    const selectSet = new Set<string>();
    const sortArr: {
      alias: string;
      field: string;
      direction: 'ASC' | 'DESC';
    }[] = [];

    const addJoin = (path: string[]) => {
      if (path.length === 0) return;

      let currentMeta = meta;
      let currentAlias = rootAlias;
      let parentAlias = rootAlias;

      for (let i = 0; i < path.length; i++) {
        const segment = path[i];
        const found = this.lookupFieldOrRelation(currentMeta, segment);

        if (found.kind === 'relation') {
          parentAlias = currentAlias;

          // Sửa chỗ này — alias phụ thuộc vào path
          currentAlias = `${rootAlias}_${path.slice(0, i + 1).join('_')}`;

          const propertyPath = segment;

          if (!joinArr.find((j) => j.alias === currentAlias)) {
            joinArr.push({
              alias: currentAlias,
              parentAlias,
              propertyPath,
            });
            this.log.push(
              `+ Add join path: ${parentAlias}.${propertyPath} → alias = ${currentAlias}`,
            );
          }

          currentMeta = this.dataSourceService
            .getDataSource()
            .getMetadata(found.type);
        }
      }

      if (path.length > 0) {
        return {
          parentAlias,
          propertyPath: path[path.length - 1],
          alias: currentAlias,
        };
      }
    };

    const addSelect = (path: string[]) => {
      addJoin(path.slice(0, -1));
      for (let i = 0; i < path.length - 1; i++) {
        const subPath = path.slice(0, i + 1);

        const res = this.resolvePathWithJoin({
          meta,
          path: subPath,
          rootAlias,
          addJoin,
        });

        selectSet.add(`${res.alias}.id`);
        this.log.push(`+ Add select (relation auto id): ${res.alias}.id`);
      }
      const res = this.resolvePathWithJoin({
        meta,
        path,
        rootAlias,
        addJoin,
      });

      if (res.lastField.kind === 'field') {
        selectSet.add(`${res.alias}.${res.lastField.propertyName}`);
        this.log.push(
          `+ Add select: ${res.alias}.${res.lastField.propertyName}`,
        );
      } else {
        const result = addJoin(path);
        if (result) {
          this.log.push(
            `+ Add join (select relation): ${result.parentAlias}.${result.propertyPath} → alias: ${result.alias}`,
          );
        }

        selectSet.add(`${res.alias}.id`);
        this.log.push(`+ Add select (relation.id): ${res.alias}.id`);

        for (const rel of res.lastMeta.relations) {
          const relPath = [...path, rel.propertyName];
          const childResult = addJoin(relPath);
          if (childResult) {
            selectSet.add(`${childResult.alias}.id`);

            this.log.push(
              `+ Add select (relation 1 tầng).id: ${childResult.alias}.id`,
            );
          }
        }
      }
    };

    const addWildcardSelect = (path: string[]) => {
      // B1: add select .id cho từng tầng cha
      for (let i = 0; i < path.length; i++) {
        const subPath = path.slice(0, i + 1);

        const res = this.resolvePathWithJoin({
          meta,
          path: subPath,
          rootAlias,
          addJoin,
        });

        selectSet.add(`${res.alias}.id`);
        this.log.push(`+ Add select (relation auto id): ${res.alias}.id`);
      }

      // B2: select columns của alias cuối
      const res = this.resolvePathWithJoin({
        meta,
        path,
        rootAlias,
        addJoin,
      });

      for (const col of res.lastMeta.columns) {
        selectSet.add(`${res.alias}.${col.propertyName}`);
        this.log.push(`+ Add select ( * ): ${res.alias}.${col.propertyName}`);
      }

      for (const rel of res.lastMeta.relations) {
        const relPath = [...path, rel.propertyName];

        const childResult = addJoin(relPath);
        if (childResult) {
          selectSet.add(`${childResult.alias}.id`);
          this.log.push(
            `+ Add select (wildcard relation.id): ${childResult.alias}.id`,
          );
        }
      }
    };

    const normalizePaths = (input?: string | string[]): string[][] => {
      if (!input) return [];
      if (typeof input === 'string') {
        return input.split(',').map((s) => s.trim().split('.'));
      }
      return input.map((s) => s.trim().split('.'));
    };

    // === Build from fields ===
    const fieldPaths = normalizePaths(fields ? fields : '*');
    selectSet.add(`${rootAlias}.id`);
    this.log.push(`+ Add select: ${rootAlias}.id`);
    this.log.push(`Build from fields: ${JSON.stringify(fieldPaths)}`);

    for (const path of fieldPaths) {
      const last = path[path.length - 1];
      if (last === '*') {
        addWildcardSelect(path.slice(0, -1));
      } else {
        addSelect(path);
      }
    }

    // === Build from filter ===
    const extractPathsFromFilter = (
      f: any,
      basePath: string[] = [],
      currentMeta = meta,
    ) => {
      if (!f || typeof f !== 'object') return;
      if (Array.isArray(f)) {
        for (const item of f)
          extractPathsFromFilter(item, basePath, currentMeta);
        return;
      }
      for (const key in f) {
        if (['and', 'or'].includes(key)) {
          extractPathsFromFilter(f[key], basePath, currentMeta);
        } else if (!OPERATORS.includes(key)) {
          const path = [...basePath, key];
          const found = this.lookupFieldOrRelation(currentMeta, key);

          if (found.kind === 'relation') {
            const result = addJoin(path);
            if (result) {
              this.log.push(
                `+ Add join (filter): ${result.parentAlias}.${result.propertyPath} → alias: ${result.alias}`,
              );
            }

            const nextMeta = this.dataSourceService
              .getDataSource()
              .getMetadata(found.type);
            const val = f[key];
            if (typeof val === 'object') {
              extractPathsFromFilter(val, path, nextMeta);
            }
          } else {
            const val = f[key];
            if (typeof val === 'object') {
              extractPathsFromFilter(val, path, currentMeta);
            }
          }
        }
      }
    };

    this.log.push(`Build from filter`);
    extractPathsFromFilter(filter);

    // === Build from sort ===
    const sortPaths = normalizePaths(sort);
    this.log.push(`Build from sort: ${JSON.stringify(sortPaths)}`);

    for (const path of sortPaths) {
      const result = addJoin(path.slice(0, -1));
      if (result) {
        this.log.push(
          `+ Add join (sort): ${result.parentAlias}.${result.propertyPath}`,
        );
      }

      const res = this.resolvePathWithJoin({
        meta,
        path,
        rootAlias,
        addJoin,
      });

      if (res.lastField.kind === 'field') {
        sortArr.push({
          alias: res.alias,
          field: res.lastField.propertyName,
          direction: 'ASC', // default ASC — về sau có thể parse ASC/DESC
        });
        this.log.push(
          `+ Add sort: ${res.alias}.${res.lastField.propertyName} ASC`,
        );
      }
    }

    return {
      joinArr,
      selectArr: Array.from(selectSet),
      sortArr,
    };
  }

  private walkFilter({
    filter,
    currentMeta,
    currentAlias,
    operator = 'AND' as 'AND' | 'OR',
    path = [],
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
        for (const item of f) {
          walk(item, path, currentMeta, currentAlias, operator);
        }
        return;
      }

      for (const key in f) {
        if (['and', 'or'].includes(key)) {
          const nextOp: 'AND' | 'OR' = key === 'and' ? 'AND' : 'OR';
          walk(f[key], path, currentMeta, currentAlias, nextOp);
        } else if (key === '_not') {
          const subParts = this.walkFilter({
            filter: f[key],
            currentMeta,
            currentAlias,
            operator: 'AND',
            path,
          });
          subParts.parts.forEach((p) => {
            parts.push({
              operator,
              sql: `NOT (${p.sql})`,
              params: p.params,
            });
            this.log.push(`[${operator}] NOT (${p.sql})`);
          });
        } else if (!OPERATORS.includes(key)) {
          const found = this.lookupFieldOrRelation(currentMeta, key);
          const newPath = [...path, key];

          if (found.kind === 'relation') {
            const nextMeta = this.dataSourceService
              .getDataSource()
              .getMetadata(found.type);
            const nextAlias = `${currentAlias}_${key}`;
            const val = f[key];

            if (typeof val === 'object') {
              walk(val, newPath, nextMeta, nextAlias, operator);
            }
          } else {
            const val = f[key];
            if (typeof val === 'object') {
              walk(val, newPath, currentMeta, currentAlias, operator);
            }
          }
        } else {
          const lastField = path[path.length - 1];
          const found = this.lookupFieldOrRelation(currentMeta, lastField);

          const paramKey = `p${paramIndex++}`;
          const param = {};
          let sql = '';

          if (found.kind === 'field') {
            const fieldType = found.type;
            const parsedValue = this.parseValue(fieldType, f[key]);

            if (key === '_eq') {
              sql = `${currentAlias}.${lastField} = :${paramKey}`;
              param[paramKey] = parsedValue;
            } else if (key === '_between') {
              const p1 = `p${paramIndex++}`;
              const p2 = `p${paramIndex++}`;
              sql = `${currentAlias}.${lastField} BETWEEN :${p1} AND :${p2}`;
              param[p1] = this.parseValue(fieldType, f[key][0]);
              param[p2] = this.parseValue(fieldType, f[key][1]);
            } else if (key === '_is_null') {
              sql = `${currentAlias}.${lastField} IS ${f[key] ? '' : 'NOT '}NULL`;
            } else if (key === '_contains') {
              sql = `lower(unaccent(${currentAlias}.${lastField})) LIKE CONCAT('%', lower(unaccent(:${paramKey})), '%')`;
              param[paramKey] = parsedValue;
            } else if (key === '_starts_with') {
              sql = `lower(unaccent(${currentAlias}.${lastField})) LIKE CONCAT(lower(unaccent(:${paramKey})), '%')`;
              param[paramKey] = parsedValue;
            } else if (key === '_ends_with') {
              sql = `lower(unaccent(${currentAlias}.${lastField})) LIKE CONCAT('%', lower(unaccent(:${paramKey})))`;
              param[paramKey] = parsedValue;
            } else if (key === '_in') {
              sql = `EXISTS (SELECT 1 FROM ${currentAlias} sub WHERE sub.${lastField} IN (:...${paramKey}))`;
              param[paramKey] = Array.isArray(f[key])
                ? f[key].map((v) => this.parseValue(fieldType, v))
                : [this.parseValue(fieldType, f[key])];
            } else if (key === '_neq') {
              sql = `${currentAlias}.${lastField} != :${paramKey}`;
              param[paramKey] = parsedValue;
            } else if (key === '_gt') {
              sql = `${currentAlias}.${lastField} > :${paramKey}`;
              param[paramKey] = parsedValue;
            } else if (key === '_gte') {
              sql = `${currentAlias}.${lastField} >= :${paramKey}`;
              param[paramKey] = parsedValue;
            } else if (key === '_lt') {
              sql = `${currentAlias}.${lastField} < :${paramKey}`;
              param[paramKey] = parsedValue;
            } else if (key === '_lte') {
              sql = `${currentAlias}.${lastField} <= :${paramKey}`;
              param[paramKey] = parsedValue;
            } else if (key === '_not_in') {
              sql = `${currentAlias}.${lastField} NOT IN (:...${paramKey})`;
              param[paramKey] = Array.isArray(f[key])
                ? f[key].map((v) => this.parseValue(fieldType, v))
                : [this.parseValue(fieldType, f[key])];
            } else {
              throw new Error(`Unknown operator '${key}'`);
            }
          } else if (found.kind === 'relation') {
            const joinColumn = found.joinColumn || 'id';
            const joinColMeta = currentMeta.columns.find(
              (c) => c.propertyName === joinColumn,
            );
            const joinColType = joinColMeta
              ? String(joinColMeta.type)
              : 'unknown';
            const parsedValue = this.parseValue(joinColType, f[key]);

            if (key === '_eq') {
              sql = `${currentAlias}.${joinColumn} = :${paramKey}`;
              param[paramKey] = parsedValue;
            } else if (key === '_in') {
              sql = `EXISTS (SELECT 1 FROM ${currentAlias} sub WHERE sub.${joinColumn} IN (:...${paramKey}))`;
              param[paramKey] = Array.isArray(f[key])
                ? f[key].map((v) => this.parseValue(joinColType, v))
                : [this.parseValue(joinColType, f[key])];
            } else if (key === '_count') {
              if (!found.isMany) {
                throw new Error(
                  `Invalid _count on relation '${lastField}' — only applicable for one-to-many or many-to-many`,
                );
              }

              const opKey = Object.keys(f[key])[0];
              const opVal = f[key][opKey];
              const countParamKey = `p${paramIndex++}`;
              const subAlias = `${currentAlias}_${lastField}_sub`;

              let havingSql = '';

              if (opKey === '_eq') {
                havingSql = `HAVING COUNT(*) = :${countParamKey}`;
              } else if (opKey === '_gt') {
                havingSql = `HAVING COUNT(*) > :${countParamKey}`;
              } else if (opKey === '_lt') {
                havingSql = `HAVING COUNT(*) < :${countParamKey}`;
              } else {
                throw new Error(`Unsupported _count operator '${opKey}'`);
              }

              param[countParamKey] = Number(opVal);

              sql = `
              EXISTS (
                SELECT 1
                FROM ${found.type} ${subAlias}
                WHERE ${subAlias}.${found.inverseJoinColumn} = ${currentAlias}.${joinColumn}
                ${havingSql}
              )
            `.trim();
            } else if (key === '_eq_set') {
              if (!found.isMany) {
                throw new Error(
                  `Invalid _eq_set on relation '${lastField}' — only applicable for one-to-many or many-to-many`,
                );
              }

              const values = Array.isArray(f[key]) ? f[key] : [f[key]];
              const countParamKey = `p${paramIndex++}`;

              sql = `
              EXISTS (
                SELECT 1
                FROM ${found.type} ${currentAlias}_${lastField}_sub
                WHERE ${currentAlias}_${lastField}_sub.${found.inverseJoinColumn} = ${currentAlias}.${joinColumn}
                  AND ${currentAlias}_${lastField}_sub.${found.inverseJoinColumn} IN (:...${countParamKey})
                GROUP BY ${currentAlias}.${joinColumn}
                HAVING COUNT(DISTINCT ${currentAlias}_${lastField}_sub.${found.inverseJoinColumn}) = ${values.length}
              )
            `.trim();

              param[countParamKey] = values.map((v) =>
                this.parseValue(joinColType, v),
              );
            } else {
              throw new Error(`Unsupported operator '${key}' for relation`);
            }
          }

          parts.push({
            operator,
            sql,
            params: param,
          });

          this.log.push(`[${operator}] ${sql}`);
        }
      }
    };

    walk(filter, path, currentMeta, currentAlias, operator);

    return {
      parts,
    };
  }

  private resolvePathWithJoin({
    meta,
    path,
    rootAlias,
    addJoin,
  }: {
    meta: EntityMetadata;
    path: string[];
    rootAlias: string;
    addJoin: (path: string[]) => any;
  }): {
    alias: string;
    parentAlias: string;
    lastMeta: EntityMetadata;
    lastField: {
      kind: 'field' | 'relation';
      propertyName: string;
      type: string;
      relationType?: string;
    };
  } {
    let currentMeta = meta;
    let currentAlias = rootAlias;
    let parentAlias = rootAlias;

    for (let i = 0; i < path.length; i++) {
      const segment = path[i];
      const found = this.lookupFieldOrRelation(currentMeta, segment);

      if (found.kind === 'field') {
        if (i !== path.length - 1) {
          throw new Error(
            `Invalid path: "${segment}" is a field on table "${currentMeta.tableName}", but path continues.`,
          );
        }

        return {
          alias: currentAlias,
          parentAlias,
          lastMeta: currentMeta,
          lastField: found,
        };
      }

      // Nếu là relation → addJoin chính tầng đó
      const joinPath = path.slice(0, i + 1);
      const result = addJoin(joinPath);
      // if (result) {
      //   this.log.push(
      //     `+ Add join path (resolve): ${result.parentAlias}.${result.propertyPath} → alias = ${result.alias}`,
      //   );
      // }

      // Tiếp tục xuống tầng tiếp
      parentAlias = currentAlias;
      currentAlias = `${currentAlias}_${segment}`;
      currentMeta = this.dataSourceService
        .getDataSource()
        .getMetadata(found.type);
    }

    // Nếu kết thúc tại relation (không field)
    return {
      alias: currentAlias,
      parentAlias,
      lastMeta: currentMeta,
      lastField: this.lookupFieldOrRelation(currentMeta, 'id'),
    };
  }

  private lookupFieldOrRelation(
    meta: EntityMetadata,
    property: string,
  ):
    | { kind: 'field'; propertyName: string; type: string }
    | {
        kind: 'relation';
        propertyName: string;
        relationType: string;
        type: string;
        joinColumn: string;
        inverseJoinColumn: string;
        isMany: boolean;
      } {
    // Check relation FIRST
    const relation = meta.relations.find(
      (rel) => rel.propertyName === property,
    );
    if (relation) {
      const relationType = relation.relationType;
      const joinColumn = relation.joinColumns?.[0]?.propertyName || 'id';

      const inverseJoinColumn =
        relationType === 'many-to-many'
          ? relation.inverseJoinColumns?.[0]?.propertyName || 'id'
          : relation.inverseRelation?.joinColumns?.[0]?.propertyName || 'id';

      const isMany =
        relationType === 'one-to-many' || relationType === 'many-to-many';

      return {
        kind: 'relation',
        propertyName: relation.propertyName,
        relationType,
        type: relation.inverseEntityMetadata.tableName,
        joinColumn,
        inverseJoinColumn,
        isMany,
      };
    }

    // Then check field
    const column = meta.columns.find((col) => col.propertyName === property);
    if (column) {
      return {
        kind: 'field',
        propertyName: column.propertyName,
        type: String(column.type),
      };
    }

    throw new Error(
      `Invalid field or relation "${property}" on table "${meta.tableName}"`,
    );
  }

  private parseValue(fieldType: string, value: any): any {
    if (value === null || value === undefined) return value;

    const type = String(fieldType).toLowerCase();

    switch (type) {
      case 'int':
      case 'integer':
      case 'smallint':
      case 'bigint':
      case 'decimal':
      case 'numeric':
      case 'float':
      case 'double':
        return Number(value);

      case 'boolean':
        return value === true || value === 'true' || value === 1;

      case 'uuid':
      case 'varchar':
      case 'text':
      default:
        return String(value);
    }
  }
}
