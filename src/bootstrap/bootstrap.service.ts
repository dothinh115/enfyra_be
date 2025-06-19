import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { CommonService } from '../common/common.service';
import { MetadataSyncService } from '../metadata/metadata-sync.service';
import { SchemaStateService } from '../schema/schema-state.service';
import { DefaultDataService } from './default-data.service';
import { CoreInitService } from './core-init.service';
import { DataSourceService } from '../data-source/data-source.service';
import { SchemaReloadService } from '../schema/schema-reload.service';
import { RedisLockService } from '../common/redis-lock.service';

@Injectable()
export class BootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BootstrapService.name);

  constructor(
    private readonly commonService: CommonService,
    private readonly metadataSyncService: MetadataSyncService,
    private readonly schemaStateService: SchemaStateService,
    private readonly defaultDataService: DefaultDataService,
    private readonly coreInitService: CoreInitService,
    private dataSourceService: DataSourceService,
    private schemaReloadService: SchemaReloadService,
    private redisLockService: RedisLockService,
  ) {}

  private async waitForDatabaseConnection(
    maxRetries = 10,
    delayMs = 1000,
  ): Promise<void> {
    const settingRepo =
      this.dataSourceService.getRepository('setting_definition');

    for (let i = 0; i < maxRetries; i++) {
      try {
        await settingRepo.query('SELECT 1');
        this.logger.log('Kết nối tới DB thành công.');
        return;
      } catch (error) {
        this.logger.warn(`Chưa kết nối được DB, thử lại sau ${delayMs}ms...`);
        await this.commonService.delay(delayMs);
      }
    }
    throw new Error(`Không thể kết nối tới DB sau ${maxRetries} lần thử.`);
  }

  async onApplicationBootstrap() {
    await this.waitForDatabaseConnection();
    let settingRepo =
      this.dataSourceService.getRepository('setting_definition');
    let schemaHistoryRepo =
      this.dataSourceService.getRepository('schema_history');
    let setting: any = await settingRepo.findOne({ where: { id: 1 } });

    if (!setting || !setting.isInit) {
      await this.coreInitService.createInitMetadata();

      await this.defaultDataService.insertDefaultSettingIfEmpty();
      await this.defaultDataService.createDefaultRole();
      await this.defaultDataService.insertDefaultUserIfEmpty();

      await this.defaultDataService.createDefaultRoutes();
      await this.metadataSyncService.syncAll();

      settingRepo = this.dataSourceService.getRepository('setting_definition');
      setting = await settingRepo.findOne({ where: { id: 1 } });
      await settingRepo.update(setting.id, { isInit: true });
      schemaHistoryRepo =
        this.dataSourceService.getRepository('schema_history');
      this.logger.debug('Init thành công');

      const lastVersion: any = await schemaHistoryRepo.findOne({
        where: {},
        order: { createdAt: 'DESC' },
      });

      if (lastVersion) {
        this.schemaStateService.setVersion(lastVersion.id);
      }
    } else {
      await this.commonService.delay(Math.random() * 500);

      const acquired = await this.redisLockService.acquire(
        'global:boot',
        this.schemaReloadService.sourceInstanceId,
        10000,
      );
      if (acquired) {
        await this.metadataSyncService.syncAll();
        this.logger.warn('set aquired thanh cong', acquired);
        schemaHistoryRepo =
          this.dataSourceService.getRepository('schema_history');
        const lastVersion: any = await schemaHistoryRepo.findOne({
          where: {},
          order: { createdAt: 'DESC' },
        });
        await this.schemaReloadService.publishSchemaUpdated(lastVersion?.id);
      }
    }
  }
}
