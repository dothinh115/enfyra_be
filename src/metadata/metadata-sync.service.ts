import * as path from 'path';
import * as fs from 'fs';
import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { AutoService } from '../auto/auto.service';
import { buildToJs } from '../auto/utils/build-helper';
import {
  generateMigrationFile,
  runMigration,
} from '../auto/utils/migration-helper';
import { SchemaHistoryService } from './schema-history.service';
import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager';
import { SCHEMA_LOCK_EVENT_KEY } from '../utils/constant';
import { DataSourceService } from '../data-source/data-source.service';
import { clearOldEntitiesJs } from './utils/clear-old-entities';

@Injectable()
export class MetadataSyncService {
  private readonly logger = new Logger(MetadataSyncService.name);

  constructor(
    @Inject(forwardRef(() => AutoService))
    private autoService: AutoService,
    private schemaHistoryService: SchemaHistoryService,
    @Inject(CACHE_MANAGER) private cache: Cache,
    private dataSourceService: DataSourceService,
  ) {}

  async pullMetadataFromDb() {
    const tableRepo =
      this.autoService['dataSourceService'].getRepository('table_definition');
    if (!tableRepo) throw new Error('Không tìm thấy repo cho table_definition');

    const tables: any = await tableRepo
      .createQueryBuilder('table')
      .leftJoinAndSelect('table.columns', 'columns')
      .leftJoinAndSelect('table.relations', 'relations')
      .leftJoinAndSelect('relations.targetTable', 'targetTable')
      .getMany();

    if (tables.length === 0) return;

    tables.forEach((table) => {
      table.columns.sort((a, b) => {
        if (a.isPrimary && !b.isPrimary) return -1;
        if (!a.isPrimary && b.isPrimary) return 1;
        return a.name.localeCompare(b.name);
      });

      table.relations.sort((a, b) =>
        a.propertyName.localeCompare(b.propertyName),
      );
    });

    const inverseRelationMap = this.autoService.buildInverseRelationMap(tables);

    const entityDir = path.resolve('src', 'entities');
    const validFileNames = tables.map(
      (table) => `${table.name.toLowerCase()}.entity.ts`,
    );

    const existingFiles = fs.readdirSync(entityDir);
    for (const file of existingFiles) {
      if (!file.endsWith('.entity.ts')) continue;
      if (!validFileNames.includes(file)) {
        const fullPath = path.join(entityDir, file);
        fs.unlinkSync(fullPath);
        this.logger.warn(`🗑️ Đã xoá entity không hợp lệ: ${file}`);
      }
    }
    clearOldEntitiesJs();

    await Promise.all(
      tables.map(
        async (table) =>
          await this.autoService.entityGenerate(table, inverseRelationMap),
      ),
    );
  }

  async syncAll() {
    this.logger.warn('⏳ Locking schema for sync...');
    await this.cache.set(SCHEMA_LOCK_EVENT_KEY, true, 10000);
    try {
      await this.pullMetadataFromDb();

      buildToJs({
        targetDir: path.resolve('src/entities'),
        outDir: path.resolve('dist/entities'),
      });

      await this.autoService.clearMigrationsTable();
      generateMigrationFile();
      runMigration();
      await this.dataSourceService.reloadDataSource();

      await this.schemaHistoryService.backup();
    } catch (err) {
      this.logger.error(
        '❌ Lỗi khi đồng bộ metadata, đang khôi phục schema trước đó...',
      );
      await this.schemaHistoryService.restore();
    } finally {
      this.logger.log('✅ Unlocking schema');
      await this.cache.del(SCHEMA_LOCK_EVENT_KEY);
    }
  }

  async isLocked(): Promise<boolean> {
    return !!(await this.cache.get(SCHEMA_LOCK_EVENT_KEY));
  }
}
