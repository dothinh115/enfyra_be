import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { DataSourceService } from '../../../core/database/data-source/data-source.service';
import { SchemaStateService } from './schema-state.service';
import { v4 as uuidv4 } from 'uuid';
import { TReloadSchema } from '../../../shared/utils/types/common.type';
import { ConfigService } from '@nestjs/config';
import {
  SCHEMA_LOCK_EVENT_KEY,
  SCHEMA_PULLING_EVENT_KEY,
  SCHEMA_UPDATED_EVENT_KEY,
} from '../../../shared/utils/constant';
import { RedisPubSubService } from '../../../infrastructure/redis/services/redis-pubsub.service';
import { CommonService } from '../../../shared/common/services/common.service';
import { MetadataSyncService } from './metadata-sync.service';
import { RedisLockService } from '../../../infrastructure/redis/services/redis-lock.service';
import { GraphqlService } from '../../graphql/services/graphql.service';

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
    @Inject(forwardRef(() => GraphqlService))
    private graphqlService: GraphqlService,
  ) {
    this.sourceInstanceId = uuidv4();
    this.logger.log(
      `Initialized with sourceInstanceId: ${this.sourceInstanceId}`,
    );
  }

  async subscribe(message: string) {
    this.logger.log(`Received message: ${message}`);
    const data: TReloadSchema = JSON.parse(message);

    if (this.sourceInstanceId === data.sourceInstanceId) {
      this.logger.log(`Same sourceInstanceId, skipping`);
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
      this.logger.warn('No schema found, skipping');
      return;
    }

    const localVersion = this.schemaStateService.getVersion();
    this.logger.log(
      `Received version: ${data.version}, Latest schema: ${newestSchema['id']}, Current version: ${localVersion}`,
    );

    if (
      data.version < newestSchema['id'] ||
      localVersion >= newestSchema['id']
    ) {
      this.logger.log('Version invalid or already processed, skipping');
      return;
    }

    if (node_name === data.node_name) {
      await this.commonService.delay(Math.random() * 300 + 300);
      this.logger.log('Same node, only reload DataSource');
      await this.dataSourceService.reloadDataSource();
      await this.graphqlService.reloadSchema();
      this.schemaStateService.setVersion(newestSchema['id']);
      this.logger.log(
        `DataSource reload complete, set version = ${newestSchema['id']}`,
      );
      return;
    }

    const acquired = await this.redisLockService.acquire(
      `${SCHEMA_PULLING_EVENT_KEY}:${this.configService.get('NODE_NAME')}`,
      this.sourceInstanceId,
      10000,
    );
    if (acquired) {
      this.logger.log('Lock acquired, proceeding to pull...');
      await this.metadataSyncService.syncAll();
      this.schemaStateService.setVersion(newestSchema['id']);
      this.logger.log(
        `DataSource reload complete, set version = ${newestSchema['id']}`,
      );
      await this.redisLockService.release(
        SCHEMA_PULLING_EVENT_KEY,
        this.sourceInstanceId,
      );
      this.logger.log('Pull completed and lock removed');
      return;
    }

    this.logger.log('Lock pulling exists, waiting...');
    while (
      await this.redisLockService.get(
        `${SCHEMA_PULLING_EVENT_KEY}:${this.configService.get('NODE_NAME')}`,
      )
    ) {
      await this.commonService.delay(Math.random() * 300 + 300);
    }

    this.logger.log('Lock removed, proceeding to reload DataSource');
    await this.dataSourceService.reloadDataSource();
    await this.graphqlService.reloadSchema();
    this.schemaStateService.setVersion(newestSchema['id']);
    this.logger.log(`Reload complete, set version = ${newestSchema['id']}`);
  }

  async lockSchema() {
    const isLocked = await this.redisLockService.get(SCHEMA_LOCK_EVENT_KEY);
    if (!isLocked) {
      await this.redisLockService.acquire(
        SCHEMA_LOCK_EVENT_KEY,
        this.sourceInstanceId,
        10000,
      );
      this.logger.log(`🔐 Set schema lock: true`);
    } else {
      this.logger.warn('Schema was already locked');
    }
  }

  async unlockSchema() {
    const maxWaitTimeMs = 10000;
    const intervalMs = 500;
    let waited = 0;

    while (await this.redisLockService.get(SCHEMA_PULLING_EVENT_KEY)) {
      if (waited >= maxWaitTimeMs) {
        this.logger.warn('⏳ Waited too long, force unlock schema!');
        break;
      }

      this.logger.log('🔁 Reloading schema, waiting...');
      await this.commonService.delay(intervalMs);
      waited += intervalMs;
    }

    await this.redisLockService.release(
      SCHEMA_LOCK_EVENT_KEY,
      this.sourceInstanceId,
    );
    this.logger.log('🔓 Schema lock has been released');
  }

  async publishSchemaUpdated(version: number) {
    const reloadSchemaMsg: TReloadSchema = {
      event: 'schema-updated',
      node_name: this.configService.get('NODE_NAME'),
      sourceInstanceId: this.sourceInstanceId,
      version,
    };
    this.schemaStateService.setVersion(version);
    this.logger.log(
      `Broadcasting schema updated event with version: ${version}`,
    );
    await this.redisPubSubService.publish(
      SCHEMA_UPDATED_EVENT_KEY,
      JSON.stringify(reloadSchemaMsg),
    );
    this.logger.log('Schema updated event broadcast complete');
  }

  async checkLockChangeSchema() {
    const lock = await this.redisLockService.get(SCHEMA_LOCK_EVENT_KEY);
    return lock;
  }
}
