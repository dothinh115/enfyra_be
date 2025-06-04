import { BadRequestException, Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { QueryBuilderService } from './query-builder.service';
import { QueryUtilService } from './query-util.service';
import { OrmService } from './orm.service';
import * as qs from 'qs';
import { FieldService } from './field.service';
import { FilterService } from './filter.service';
import { SortService } from './sort.service';
import { MetaService } from './meta.service';
import * as crypto from 'crypto';
import { TQuery } from '../utils/type';

@Injectable()
export class QueryService {
  constructor(
    private queryUtilService: QueryUtilService,
    private ormService: OrmService,
    private fieldService: FieldService,
    private filterService: FilterService,
    private sortService: SortService,
    private metaService: MetaService,
  ) {}

  public async query({
    repository,
    query,
    id,
  }: {
    repository: Repository<any>;
    query: any;
    id?: string | number;
  }) {
    query = qs.parse(query, { depth: 10 });
    const fields = query.fields
      ? query.fields.split(',').filter((x) => x !== '')
      : [];
    let filter = query.filter || {};
    const page = query.page || 1;
    const limit = query.limit || 10;
    const meta = query.meta
      ? query.meta.split(',').filter((x) => x !== '')
      : [];
    const sort = query.sort
      ? query.sort.split(',').filter((x) => x !== '')
      : ['id'];
    let cache = Number(query.cache) || null;
    if (cache) cache = Math.min(Math.max(cache, 1000), 60000);

    if (id) {
      filter = {
        ...filter,
        id: { _eq: id },
      };
    }

    const base = [
      repository.metadata.name.toLowerCase(),
      page,
      limit,
      sort.join(',') || 'none',
      fields.join(',') || 'all',
      meta.join(',') || 'none',
    ].join(':');

    const filterStr = JSON.stringify(filter);
    const filterHash = crypto.createHash('md5').update(filterStr).digest('hex');
    const cacheKey = `${base}:f_${filterHash}`;

    try {
      const queryBuilder = new QueryBuilderService(
        this.fieldService,
        this.filterService,
        this.sortService,
        this.metaService,
        this.queryUtilService,
      );
      queryBuilder.create(repository);
      const result = await queryBuilder
        .field(fields)
        .filter(filter)
        .sort(sort)
        .paginate({ page, limit })
        .meta(meta)
        .cache(cache ? cacheKey : false, cache)
        .build();
      if (id) {
        result.data = result.data[0];
      }
      return result;
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  async create<T>({
    repository,
    body,
    query = {},
    checkIsExists,
  }: {
    repository: Repository<any>;
    body: T;
    query: TQuery;
    checkIsExists?: Partial<T>;
  }) {
    //set default role nếu có
    const entityName = repository.metadata.name.toLowerCase();

    if (entityName === 'user') {
      body = await this.queryUtilService.setDefaultRole(body);
      body = this.queryUtilService.autoGenerateUsername(body);
    }

    //check exist nếu có
    if (checkIsExists) {
      const isExists = await repository.exists({
        where: checkIsExists,
      });
      if (isExists) {
        throw new Error(`${JSON.stringify(checkIsExists)} đã tồn tại.`);
      }
    }

    //convert cho đúng định dạng của entity
    body = this.queryUtilService.convertToEntity(entityName, body);

    //create entity và tiến hành lưu vào db
    const newItem = repository.create(body);
    const created = await repository.save(newItem);

    //trả ra kết quả với filter là id của item vừa lưu
    return await this.query({
      repository,
      query,
      id: created.id,
    });
  }

  async update<T>({
    repository,
    id,
    body,
    query = {},
    user,
  }: {
    repository: Repository<any>;
    id: string | number;
    body: T;
    query: TQuery;
    user?: any;
  }) {
    //check exist trước khi update
    const item = await repository.findOne({
      where: {
        id,
      },
    });
    if (!item) throw new Error('Record không tồn tại!');
    const entityName = repository.metadata.name.toLowerCase();
    //nếu đang update setting
    if (entityName === 'setting') {
      this.queryUtilService.resetDefaultRole(body);
    }
    //nếu đang update user
    if (entityName === 'user') {
      if (item['rootUser'] && !user['rootUser'])
        throw new Error('Không thể update rootUser');

      const usernameCheck = await repository.exists({
        where: {
          username: body['username'],
        },
      });

      if (item['username'] !== body['username'] && usernameCheck)
        throw new Error('Username này đã được sử dụng!');
    }
    //convert cho đúng định dạng của entity
    body = this.queryUtilService.convertToEntity(entityName, body);

    for (const key of Object.keys(body)) {
      item[key] = body[key];
    }

    const updated = await repository.save(item);
    return await this.query({
      repository,
      query,
      id: updated.id,
    });
  }

  async delete({
    repository,
    id,
    user,
  }: {
    repository: Repository<any>;
    id: string | number;
    user?: any;
  }) {
    const entityName = repository.metadata.name.toLowerCase();

    //check exist
    const isExists = await repository.findOne({
      where: {
        id,
      },
    });

    //check rootUser
    if (entityName === 'user' && isExists?.rootUser)
      throw new Error('Không thể xoá rootUser');

    if (!isExists) throw new Error('Record không tồn tại!');
    //check relation để báo lỗi cho đúng
    await this.ormService.checkIfReferenced(repository, id);

    //nếu pass hết thì tiến hành xoá
    await repository.delete(id);
    return isExists;
  }
}
