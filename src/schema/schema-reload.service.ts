import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { DataSourceService } from '../data-source/data-source.service';
import { AutoService } from '../auto/auto-entity.service';
import { SchemaStateService } from './schema-state.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { v4 as uuidv4 } from 'uuid';
import { TReloadSchema } from '../utils/types/common.type';
import { ConfigService } from '@nestjs/config';
import { Cache } from 'cache-manager';
import {
  SCHEMA_LOCK_EVENT_KEY,
  SCHEMA_UPDATED_EVENT_KEY,
} from '../utils/constant';
import { RedisPubSubService } from '../redis-pubsub/redis-pubsub.service';
import { CommonService } from '../common/common.service';

@Injectable()
export class SchemaReloadService {
  constructor(
    private dataSourceService: DataSourceService,
    private autoService: AutoService,
    private schemaStateService: SchemaStateService,
    @Inject(CACHE_MANAGER) private cache: Cache,
    private configService: ConfigService,
    @Inject(forwardRef(() => RedisPubSubService))
    private redisPubSubService: RedisPubSubService,
    private commonService: CommonService,
  ) {
    this.sourceInstanceId = uuidv4();
  }
  private sourceInstanceId: string;

  async subscribe(message: string) {
    const data: TReloadSchema = JSON.parse(message);
    //nếu cùng instance, bỏ qua
    if (this.sourceInstanceId === data.sourceInstanceId) return;
    const node_name = this.configService.get<string>('NODE_NAME');
    const schemaHistoryRepo =
      this.dataSourceService.getRepository('schema_history');
    const newestSchema = await schemaHistoryRepo
      .createQueryBuilder('schema')
      .orderBy('schema.createdAt', 'DESC')
      .getOne();
    if (!newestSchema) return;
    const localVersion = this.schemaStateService.getVersion();

    // nếu version trong message bé hơn newest, bỏ qua, để lắng nghe version cao hơn
    //nếu version hiện tại lớn hơn hoặc bằng version mới nhất, bỏ qua

    if (data.version < newestSchema['id'] || localVersion >= newestSchema['id'])
      return;

    //nếu cùng 1 node , chỉ tiến hành reload datasource
    if (node_name === data.node_name) {
      await this.dataSourceService.reloadDataSource();
      //update version sau khi reload
      this.schemaStateService.setVersion(newestSchema['id']);
      return;
    }
    //nếu ko cùng 1 node thì set lock và tiến hành pull metadata
    const sourceIdInMem = await this.cache.get('dynamiq:pulling');
    if (!sourceIdInMem) {
      await this.cache.set('dynamiq:pulling', this.sourceInstanceId, 10);
      await this.autoService.pullMetadataFromDb();
      //sau khi pull xong phải clear lock để các instance khác ko đợi
      await this.cache.del('dynamiq:pulling');
      return;
    }
    //nếu đang có lock thì liên tục check lock để reload datasource (không pull)
    while (await this.cache.get('dynamiq:pulling')) {
      await this.commonService.delay(Math.random() * 300 + 300);
    }
    //hết lock thì reload DS
    await this.dataSourceService.reloadDataSource();
    //set version
    this.schemaStateService.setVersion(newestSchema['id']);
  }

  async lockChangeSchema() {
    const isLocked = await this.cache.get(SCHEMA_LOCK_EVENT_KEY);
    if (!isLocked) {
      await this.cache.set(SCHEMA_LOCK_EVENT_KEY, true, 10);
    }
  }

  async publishSchemaUpdated(version: number) {
    const reloadSchemaMsg: TReloadSchema = {
      event: 'schema-updated',
      node_name: this.configService.get('NODE_NAME'),
      sourceInstanceId: this.sourceInstanceId,
      version,
    };
    //lưu version hiện tại
    this.schemaStateService.setVersion(version);
    await this.redisPubSubService.publish(
      SCHEMA_UPDATED_EVENT_KEY,
      JSON.stringify(reloadSchemaMsg),
    );
  }

  async checkLockChangeSchema() {
    return await this.cache.get(SCHEMA_LOCK_EVENT_KEY);
  }
}
