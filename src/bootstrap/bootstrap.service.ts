import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Setting_definition } from '../entities/setting_definition.entity';
import { Schema_history } from '../entities/schema_history.entity';
import { CommonService } from '../common/common.service';
import { MetadataSyncService } from '../metadata/metadata-sync.service';
import { SchemaStateService } from '../schema/schema-state.service';
import { DefaultDataService } from './default-data.service';
import { CoreInitService } from './core-init.service';

@Injectable()
export class BootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BootstrapService.name);

  constructor(
    private readonly commonService: CommonService,
    private readonly metadataSyncService: MetadataSyncService,
    private readonly schemaStateService: SchemaStateService,
    private readonly defaultDataService: DefaultDataService,
    private readonly coreInitService: CoreInitService,
    @InjectRepository(Setting_definition)
    private readonly settingRepo: Repository<Setting_definition>,
    @InjectRepository(Schema_history)
    private readonly schemaHistoryRepo: Repository<Schema_history>,
  ) {}

  private async waitForDatabaseConnection(
    maxRetries = 10,
    delayMs = 1000,
  ): Promise<void> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        await this.settingRepo.query('SELECT 1');
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

    let setting = await this.settingRepo.findOne({ where: { id: 1 } });

    if (!setting || !setting.isInit) {
      await this.coreInitService.createInitMetadata();

      await this.defaultDataService.insertDefaultSettingIfEmpty();
      await this.defaultDataService.createDefaultRole();
      await this.defaultDataService.insertDefaultUserIfEmpty();

      await this.metadataSyncService.syncAll();
      await this.defaultDataService.createDefaultRoutes();

      setting = await this.settingRepo.findOne({ where: { id: 1 } });
      await this.settingRepo.update(setting.id, { isInit: true });

      this.logger.debug('Init thành công');

      const lastVersion = await this.schemaHistoryRepo.findOne({
        where: {},
        order: { createdAt: 'DESC' },
      });

      if (lastVersion) {
        this.schemaStateService.setVersion(lastVersion.id);
      }
    } else {
      await this.metadataSyncService.syncAll();
      const lastVersion = await this.schemaHistoryRepo.findOne({
        where: {},
        order: { createdAt: 'DESC' },
      });

      if (lastVersion) {
        this.schemaStateService.setVersion(lastVersion.id);
      }
    }
  }
}
