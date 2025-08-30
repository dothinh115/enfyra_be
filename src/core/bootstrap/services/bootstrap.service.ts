import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { CommonService } from '../../../shared/common/services/common.service';
import { MetadataSyncService } from '../../../modules/schema-management/services/metadata-sync.service';
import { SchemaStateService } from '../../../modules/schema-management/services/schema-state.service';
import { DefaultDataService } from './default-data.service';
import { CoreInitService } from './core-init.service';
import { DataSourceService } from '../../../core/database/data-source/data-source.service';
import { SchemaReloadService } from '../../../modules/schema-management/services/schema-reload.service';
import { RedisLockService } from '../../../infrastructure/redis/services/redis-lock.service';

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
    private redisLockService: RedisLockService
  ) {}

  private async waitForDatabaseConnection(
    maxRetries = 3,
    delayMs = 100 // Reduced from 200ms
  ): Promise<void> {
    let settingRepo =
      this.dataSourceService.getRepository('setting_definition');

    for (let i = 0; i < maxRetries; i++) {
      try {
        await settingRepo.query('SELECT 1');
        this.logger.log('Database connection successful.');
        return;
      } catch (error) {
        this.logger.warn(
          `Unable to connect to DB, retrying after ${delayMs}ms... (${i + 1}/${maxRetries})`
        );
        await this.commonService.delay(delayMs);
        await this.dataSourceService.reloadDataSource();
        settingRepo =
          this.dataSourceService.getRepository('setting_definition');
      }
    }
    throw new Error(`Unable to connect to DB after ${maxRetries} attempts.`);
  }

  async onApplicationBootstrap() {
    try {
      // Quick database connection check
      await this.waitForDatabaseConnection();
    } catch (err) {
      this.logger.error('❌ Error during application bootstrap:', err);
    }

    // Check if initialization is needed
    let settingRepo =
      this.dataSourceService.getRepository('setting_definition');
    let setting: any = await settingRepo.findOne({
      where: {},
      order: { id: 'ASC' },
    });

    if (!setting || !setting.isInit) {
      this.logger.log('🔄 Running upsert to sync default data...');

      // Run core initialization in parallel
      const [coreInitResult, defaultDataResult] = await Promise.all([
        this.coreInitService.createInitMetadata(),
        this.defaultDataService.insertAllDefaultRecords(),
      ]);

      // Run metadata sync after core operations complete
      this.logger.log('🔄 Starting metadata synchronization...');
      const syncResult = await this.metadataSyncService.syncAll();
      this.logger.debug(
        `Bootstrap sync result: ${syncResult.status}`,
        syncResult
      );

      // Update setting
      settingRepo = this.dataSourceService.getRepository('setting_definition');
      setting = await settingRepo.findOne({
        where: {},
        order: { id: 'ASC' },
      });

      if (!setting) {
        this.logger.error('❌ Setting record not found after initialization');
        throw new Error(
          'Setting record not found after initialization. DefaultDataService may have failed.'
        );
      }

      await settingRepo.update(setting.id, { isInit: true });
      this.logger.log('✅ Bootstrap initialization completed successfully');
    } else {
      this.logger.log('✅ Application already initialized, skipping bootstrap');
    }
  }
}
