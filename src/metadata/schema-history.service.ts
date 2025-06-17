import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Table_definition } from '../entities/table_definition.entity';
import { Schema_history } from '../entities/schema_history.entity';
import { MetadataSyncService } from '../metadata/metadata-sync.service';
import { clearOldEntitiesJs } from './utils/clear-old-entities';

@Injectable()
export class SchemaHistoryService {
  private readonly logger = new Logger(SchemaHistoryService.name);

  constructor(
    @InjectRepository(Table_definition)
    private readonly tableDefRepo: Repository<Table_definition>,
    @InjectRepository(Schema_history)
    private readonly schemaHistoryRepo: Repository<Schema_history>,
    @Inject(forwardRef(() => MetadataSyncService))
    private readonly metadataSyncService: MetadataSyncService,
  ) {}

  async backup() {
    const tables = await this.tableDefRepo
      .createQueryBuilder('table')
      .leftJoinAndSelect('table.columns', 'columns')
      .leftJoinAndSelect('table.relations', 'relations')
      .getMany();

    const historyCount = await this.schemaHistoryRepo.count();
    if (historyCount > 20) {
      const oldest = await this.schemaHistoryRepo.findOne({
        where: {},
        order: { createdAt: 'ASC' },
      });
      if (oldest) {
        await this.schemaHistoryRepo.delete(oldest.id);
      }
    }

    await this.schemaHistoryRepo.save({ schema: tables });
    this.logger.log('✅ Đã backup metadata hiện tại vào schema_history');
  }

  async restore() {
    const oldest = await this.schemaHistoryRepo.findOne({
      where: {},
      order: { createdAt: 'ASC' },
    });

    if (oldest) {
      await this.tableDefRepo.save(oldest.schema);
      this.logger.warn('⚠️ Đã khôi phục metadata từ schema_history');
      await this.metadataSyncService.syncAll();
    } else {
      this.logger.warn('⚠️ Không có bản backup schema nào để khôi phục');
    }
  }
}
