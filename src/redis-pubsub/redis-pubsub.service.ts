// redis-pubsub.service.ts
import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { DataSourceService } from '../data-source/data-source.service';
import { AutoService } from '../auto/auto-entity.service';
import { SchemaStateService } from '../schema/schema-state.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

export type TReloadSchema = {
  node_name: string;
  sourceInstanceId: string;
  event: 'schema-updated';
  version: string;
};

@Injectable()
export class RedisPubSubService implements OnModuleInit, OnModuleDestroy {
  constructor(
    private configService: ConfigService,
    private dataSourceService: DataSourceService,
    private autoService: AutoService,
    private schemaStateService: SchemaStateService,
    @Inject(CACHE_MANAGER) private cache: Cache,
  ) {}
  private pub: Redis;
  private sub: Redis;
  private sourceInstanceId: string;

  async onModuleInit() {
    this.pub = new Redis(this.configService.get<string>('REDIS_URI'));
    this.sub = new Redis(this.configService.get<string>('REDIS_URI'));
    this.sourceInstanceId = uuidv4();
    await this.sub.subscribe('dynamiq:schema-updated');

    this.sub.on('message', async (channel, message) => {
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

      if (
        new Date(data.version) < new Date(newestSchema['createdAt']) ||
        new Date(localVersion) >= new Date(newestSchema['createdAt'])
      )
        return;

      //nếu cùng 1 node , chỉ tiến hành reload datasource
      if (node_name === data.node_name) {
        await this.dataSourceService.reloadDataSource();
        return;
      }
      //nếu ko cùng 1 node thì set lock và tiến hành pull metadata
      const sourceIdInMem = await this.cache.get('dynamiq:pulling');
      if (!sourceIdInMem && sourceIdInMem !== this.sourceInstanceId) {
        await this.cache.set('dynamiq:pulling', this.sourceInstanceId, 10);
        await this.autoService.pullMetadataFromDb();
        //sau khi pull xong phải clear lock để các instance khác ko đợi
        await this.cache.del('dynamiq:pulling');
      }
      //nếu đang có lock thì liên tục check lock để reload datasource (không pull)
      while (await this.cache.get('dynamiq:pulling')) {
        await new Promise((resolve) => setTimeout(() => resolve(true), 500));
      }
      //hết lock thì reload DS
      await this.dataSourceService.reloadDataSource();
    });
  }

  async publish(channel: string, payload: any) {
    const message =
      typeof payload === 'string' ? payload : JSON.stringify(payload);
    await this.pub.publish(channel, message);
  }

  onModuleDestroy() {
    this.pub?.disconnect();
    this.sub?.disconnect();
  }
}
