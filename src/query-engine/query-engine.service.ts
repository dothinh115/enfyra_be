import { Injectable } from '@nestjs/common';
import { DataSourceService } from '../data-source/data-source.service';
import { Brackets } from 'typeorm';
import { parseSortInput } from './utils/parse-sort-input';
import { walkFilter } from './utils/walk-filter';
import { buildJoinTree } from './utils/build-join-tree';
import { resolveDeepRelations } from './utils/resolve-deep';

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
    deep?: Record<string, any>;
  }): Promise<any> {
    try {
      const {
        tableName,
        fields,
        filter,
        sort,
        page,
        limit,
        meta,
        deep = {},
      } = options;

      const dataSource = this.dataSourceService.getDataSource();
      const metaData = dataSource.getMetadata(tableName);

      this.log = [];
      const parsedSort = parseSortInput(sort);

      const { joinArr, selectArr, sortArr } = buildJoinTree({
        meta: metaData,
        fields,
        filter,
        sort: parsedSort.map((parsed) => parsed.field),
        rootAlias: tableName,
        dataSource,
      });

      const deepKeys = new Set(Object.keys(deep));

      // Không join nếu trùng deep
      const filteredJoinArr = joinArr.filter(
        (j) => !deepKeys.has(j.propertyPath),
      );

      // Không select nếu alias bị join trong deep
      const filteredSelectArr = selectArr.filter((sel) => {
        const [alias] = sel.split('.');
        const matchedJoin = joinArr.find((j) => j.alias === alias);
        return !(matchedJoin && deepKeys.has(matchedJoin.propertyPath));
      });

      const { parts } = walkFilter({
        filter,
        currentMeta: metaData,
        currentAlias: tableName,
      });

      const qb = dataSource.createQueryBuilder(metaData.target, tableName);

      for (const join of filteredJoinArr) {
        qb.leftJoinAndSelect(
          `${join.parentAlias}.${join.propertyPath}`,
          join.alias,
        );
      }

      qb.select([...filteredSelectArr]);

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

      for (const sort of sortArr) {
        qb.addOrderBy(
          `${sort.alias}.${sort.field}`,
          parsedSort.find((parsed) => parsed.field === sort.field)?.direction ??
            'ASC',
        );
      }

      // === Meta tổng ===
      const metaParts = (meta || '').split(',').map((x) => x.trim());
      let totalCount = 0;
      let filterCount = 0;

      if (metaParts.includes('totalCount') || metaParts.includes('*')) {
        totalCount = await dataSource
          .createQueryBuilder(metaData.target, tableName)
          .getCount();
        this.log.push(`+ totalCount = ${totalCount}`);
      }

      if (metaParts.includes('filterCount') || metaParts.includes('*')) {
        const filterQb = dataSource.createQueryBuilder(
          metaData.target,
          tableName,
        );

        if (parts.length > 0) {
          for (const join of joinArr) {
            filterQb.leftJoin(
              `${join.parentAlias}.${join.propertyPath}`,
              join.alias,
            );
          }

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

      if (limit) qb.take(limit);
      if (page && limit) qb.skip((page - 1) * limit);
      console.log(qb.getSql());
      const rows = await qb.getMany();
      const metaDeep = await resolveDeepRelations({
        queryEngine: this,
        rows,
        metaData,
        deep,
        log: this.log,
      });
      console.log(meta, metaDeep);
      return {
        data: rows,
        ...((meta || metaDeep) && {
          meta: {
            ...(totalCount && { totalCount }),
            ...(filterCount && { filterCount }),
            ...metaDeep,
          },
        }),
      };
    } catch (error) {
      console.log(error);
      throw error;
    }
  }
}
