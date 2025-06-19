import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { DataSourceService } from '../data-source/data-source.service';
import { SchemaStateService } from './schema-state.service';
import { v4 as uuidv4 } from 'uuid';
import { TReloadSchema } from '../utils/types/common.type';
import { ConfigService } from '@nestjs/config';
import {
  SCHEMA_LOCK_EVENT_KEY,
  SCHEMA_PULLING_EVENT_KEY,
  SCHEMA_UPDATED_EVENT_KEY,
} from '../utils/constant';
import { RedisPubSubService } from '../redis-pubsub/redis-pubsub.service';
import { CommonService } from '../common/common.service';
import { MetadataSyncService } from '../metadata/metadata-sync.service';
import { RedisLockService } from '../common/redis-lock.service';

@Injectable()
export class SchemaReloadService {
  private readonly logger = new Logger(SchemaReloadService.name);
  sourceInstanceId: string;

  constructor(
    private dataSourceService: DataSourceService,
    private schemaStateService: SchemaStateService,
    private configService: ConfigService,
    @Inject(forwardRef(() => RedisPubSubService))
    private redisPubSubService: RedisPubSubService,
    private commonService: CommonService,
    @Inject(forwardRef(() => MetadataSyncService))
    private metadataSyncService: MetadataSyncService,
    private redisLockService: RedisLockService,
  ) {
    this.sourceInstanceId = uuidv4();
    this.logger.log(`Khởi tạo với sourceInstanceId: ${this.sourceInstanceId}`);
  }

  async subscribe(message: string) {
    this.logger.log(`Nhận message: ${message}`);
    const data: TReloadSchema = JSON.parse(message);

    if (this.sourceInstanceId === data.sourceInstanceId) {
      this.logger.log(`Cùng sourceInstanceId, bỏ qua`);
      return;
    }

    const node_name = this.configService.get<string>('NODE_NAME');
    this.logger.log(`Node hiện tại: ${node_name}, Node gửi: ${data.node_name}`);

    const schemaHistoryRepo =
      this.dataSourceService.getRepository('schema_history');
    const newestSchema = await schemaHistoryRepo
      .createQueryBuilder('schema')
      .orderBy('schema.createdAt', 'DESC')
      .getOne();

    if (!newestSchema) {
      this.logger.warn('Không tìm thấy schema nào, bỏ qua');
      return;
    }

    const localVersion = this.schemaStateService.getVersion();
    this.logger.log(
      `Version nhận: ${data.version}, Schema mới nhất: ${newestSchema['id']}, Version hiện tại: ${localVersion}`,
    );

    if (
      data.version < newestSchema['id'] ||
      localVersion >= newestSchema['id']
    ) {
      this.logger.log('Version không hợp lệ hoặc đã xử lý rồi, bỏ qua');
      return;
    }

    if (node_name === data.node_name) {
      await this.commonService.delay(Math.random() * 300 + 300);
      this.logger.log('Cùng node, chỉ reload lại DataSource');
      await this.dataSourceService.reloadDataSource();
      this.schemaStateService.setVersion(newestSchema['id']);
      this.logger.log(
        `Reload DataSource xong, set version = ${newestSchema['id']}`,
      );
      return;
    }

    const acquired = await this.redisLockService.acquire(
      SCHEMA_PULLING_EVENT_KEY,
      this.sourceInstanceId,
      10000,
    );
    if (acquired) {
      this.logger.log('Đã lấy được lock, tiến hành pull...');
      await this.metadataSyncService.syncAll();
      this.schemaStateService.setVersion(newestSchema['id']);
      this.logger.log(
        `Reload DataSource xong, set version = ${newestSchema['id']}`,
      );
      await this.redisLockService.release(
        SCHEMA_PULLING_EVENT_KEY,
        this.sourceInstanceId,
      );
      this.logger.log('Đã pull xong và xoá lock');
      return;
    }

    this.logger.log('Có lock pulling, chờ...');
    while (await this.redisLockService.get(SCHEMA_PULLING_EVENT_KEY)) {
      await this.commonService.delay(Math.random() * 300 + 300);
    }

    this.logger.log('Lock đã bị xoá, tiến hành reload DataSource');
    await this.dataSourceService.reloadDataSource();
    this.schemaStateService.setVersion(newestSchema['id']);
    this.logger.log(`Đã reload xong, set version = ${newestSchema['id']}`);
  }

  async lockChangeSchema() {
    const isLocked = await this.redisLockService.get(SCHEMA_LOCK_EVENT_KEY);
    if (!isLocked) {
      await this.redisLockService.acquire(
        SCHEMA_LOCK_EVENT_KEY,
        this.sourceInstanceId,
        10000,
      );
      this.logger.log(`🔐 Set schema lock: true`);
    } else {
      this.logger.warn('Schema đã bị khoá trước đó');
    }
  }

  async deleteLockSchema() {
    await this.redisLockService.release(
      SCHEMA_LOCK_EVENT_KEY,
      this.sourceInstanceId,
    );
  }

  async publishSchemaUpdated(version: number) {
    const reloadSchemaMsg: TReloadSchema = {
      event: 'schema-updated',
      node_name: this.configService.get('NODE_NAME'),
      sourceInstanceId: this.sourceInstanceId,
      version,
    };
    this.schemaStateService.setVersion(version);
    this.logger.log(`Phát sự kiện schema updated với version: ${version}`);
    await this.redisPubSubService.publish(
      SCHEMA_UPDATED_EVENT_KEY,
      JSON.stringify(reloadSchemaMsg),
    );
    this.logger.log('Đã phát xong sự kiện schema updated');
  }

  async checkLockChangeSchema() {
    const lock = await this.redisLockService.get(SCHEMA_LOCK_EVENT_KEY);
    return lock;
  }
}
