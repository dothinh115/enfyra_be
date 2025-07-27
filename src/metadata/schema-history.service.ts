import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { MetadataSyncService } from '../metadata/metadata-sync.service';
import { DataSourceService } from '../data-source/data-source.service';
import * as crypto from 'crypto';

@Injectable()
export class SchemaHistoryService {
  private readonly logger = new Logger(SchemaHistoryService.name);

  constructor(
    @Inject(forwardRef(() => MetadataSyncService))
    private readonly metadataSyncService: MetadataSyncService,
    private dataSourceService: DataSourceService,
  ) {}

  async backup() {
    const tableDefRepo =
      this.dataSourceService.getRepository('table_definition');
    const schemaHistoryRepo =
      this.dataSourceService.getRepository('schema_history');

    const tables = await tableDefRepo
      .createQueryBuilder('table')
      .leftJoinAndSelect('table.columns', 'columns')
      .leftJoinAndSelect('table.relations', 'relations')
      .getMany();

    const oldestSchema: any = await schemaHistoryRepo.findOne({
      where: {},
      order: { createdAt: 'DESC' },
    });
    const hash = crypto
      .createHash('sha256')
      .update(JSON.stringify(tables))
      .digest('hex');
    if (hash === oldestSchema?.hash) {
      this.logger.debug(`Trùng hash, bỏ qua!!`);
      return;
    }
    const historyCount = await schemaHistoryRepo.count();
    if (historyCount > 20) {
      if (oldestSchema) {
        await schemaHistoryRepo.delete(oldestSchema.id);
      }
    }

    const result: any = await schemaHistoryRepo.save({ schema: tables, hash });
    this.logger.log('✅ Đã backup metadata hiện tại vào schema_history');
    return result.id;
  }

  async restore(options?: { entityName?: string; type: 'create' | 'update' }) {
    const tableDefRepo =
      this.dataSourceService.getRepository('table_definition');
    const schemaHistoryRepo =
      this.dataSourceService.getRepository('schema_history');
    if (options.type === 'create') {
      await tableDefRepo.delete({ name: options.entityName });
    }

    const oldest: any = await schemaHistoryRepo.findOne({
      where: {},
      order: { createdAt: 'DESC' },
    });

    if (oldest) {
      await tableDefRepo.save(oldest.schema);
      this.logger.warn('⚠️ Đã khôi phục metadata từ schema_history');
      await this.metadataSyncService.syncAll({
        fromRestore: true,
        type: options?.type,
      });
    } else {
      this.logger.warn('⚠️ Không có bản backup schema nào để khôi phục');
    }
  }
}
