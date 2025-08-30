import * as path from 'path';
import * as fs from 'fs';
import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { AutoService } from '../../code-generation/services/auto.service';
import { buildTypeScriptToJs } from '../../code-generation/utils/build-helper';
import {
  generateMigrationFile,
  runMigration,
} from '../../code-generation/utils/migration-helper';
import { SchemaHistoryService } from './schema-history.service';
import { DataSourceService } from '../../../core/database/data-source/data-source.service';
import { clearOldEntitiesJs } from '../utils/clear-old-entities';
import { GraphqlService } from '../../graphql/services/graphql.service';
import { LoggingService } from '../../../core/exceptions/services/logging.service';
import { ResourceNotFoundException } from '../../../core/exceptions/custom-exceptions';
import { SchemaReloadService } from './schema-reload.service';
import { RedisLockService } from '../../../infrastructure/redis/services/redis-lock.service';
import {
  SCHEMA_SYNC_LATEST_KEY,
  SCHEMA_SYNC_PROCESSING_LOCK_KEY,
  SCHEMA_SYNC_MAX_RETRIES,
  SCHEMA_SYNC_RETRY_DELAY,
  SCHEMA_SYNC_LATEST_TTL,
  SCHEMA_SYNC_LOCK_TTL,
} from '../../../shared/utils/constant';

@Injectable()
export class MetadataSyncService {
  private readonly logger = new Logger(MetadataSyncService.name);

  constructor(
    @Inject(forwardRef(() => AutoService))
    private autoService: AutoService,
    private schemaHistoryService: SchemaHistoryService,
    private dataSourceService: DataSourceService,
    @Inject(forwardRef(() => GraphqlService))
    private graphqlService: GraphqlService,
    @Inject(forwardRef(() => LoggingService))
    private loggingService: LoggingService,
    @Inject(forwardRef(() => SchemaReloadService))
    private schemaReloadService: SchemaReloadService,
    private redisLockService: RedisLockService
  ) {}

  async pullMetadataFromDb() {
    const tableDefRepo =
      this.dataSourceService.getRepository('table_definition');
    if (!tableDefRepo) {
      this.loggingService.error('Table definition repository not found', {
        context: 'pullMetadataFromDb',
      });
      throw new ResourceNotFoundException('Repository', 'table_definition');
    }

    const tables: any = await tableDefRepo
      .createQueryBuilder('table')
      .leftJoinAndSelect('table.columns', 'columns')
      .leftJoinAndSelect('table.relations', 'relations')
      .leftJoinAndSelect('relations.targetTable', 'targetTable')
      .getMany();

    if (tables.length === 0) return;

    tables.forEach(table => {
      table.columns.sort((a, b) => {
        if (a.isPrimary && !b.isPrimary) return -1;
        if (!a.isPrimary && b.isPrimary) return 1;
        return a.name.localeCompare(b.name);
      });

      table.relations.sort((a, b) =>
        a.propertyName.localeCompare(b.propertyName)
      );
    });

    const inverseRelationMap = this.autoService.buildInverseRelationMap(tables);

    const entityDir = path.resolve('src', 'core', 'database', 'entities');
    const validFileNames = tables.map(
      table => `${table.name.toLowerCase()}.entity.ts`
    );

    if (!fs.existsSync(entityDir)) {
      fs.mkdirSync(entityDir, { recursive: true });
    }
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

    // Batch processing để tối ưu performance
    const batchSize = 3;
    for (let i = 0; i < tables.length; i += batchSize) {
      const batch = tables.slice(i, i + batchSize);
      await Promise.all(
        batch.map(
          async table =>
            await this.autoService.entityGenerate(table, inverseRelationMap)
        )
      );
    }
  }

  async syncAll(): Promise<any> {
    const startTime = Date.now();
    const syncId = `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    this.logger.log(`🚀 Starting optimized metadata sync: ${syncId}`);

    // Acquire lock with shorter TTL for faster processing
    const lockAcquired = await this.redisLockService.acquire(
      SCHEMA_SYNC_PROCESSING_LOCK_KEY,
      this.schemaReloadService.sourceInstanceId,
      SCHEMA_SYNC_LOCK_TTL
    );

    if (!lockAcquired) {
      this.logger.warn('⚠️ Another sync is already in progress, skipping');
      return { status: 'skipped', reason: 'lock_not_acquired' };
    }

    try {
      // Step 1: Pull metadata from DB (optimized)
      const step1Start = Date.now();
      await this.pullMetadataFromDb();
      const step1Time = Date.now() - step1Start;
      this.logger.log(`✅ Step 1 (Pull metadata) completed in ${step1Time}ms`);

      // Step 2: Generate entities in parallel
      const step2Start = Date.now();
      await this.generateEntitiesParallel();
      const step2Time = Date.now() - step2Start;
      this.logger.log(
        `✅ Step 2 (Generate entities) completed in ${step2Time}ms`
      );

      // Step 3: Generate and run migration (optimized)
      const step3Start = Date.now();
      const migrationResult = await this.generateAndRunMigrationOptimized();
      const step3Time = Date.now() - step3Start;
      this.logger.log(`✅ Step 3 (Migration) completed in ${step3Time}ms`);

      // Step 4: Update schema history and reload (parallel)
      const step4Start = Date.now();
      await Promise.all([
        this.updateSchemaHistory(syncId),
        this.reloadDataSourceOptimized(),
      ]);
      const step4Time = Date.now() - step4Start;
      this.logger.log(
        `✅ Step 4 (History & Reload) completed in ${step4Time}ms`
      );

      // Update Redis cache
      await this.redisLockService.set(
        SCHEMA_SYNC_LATEST_KEY,
        syncId,
        SCHEMA_SYNC_LATEST_TTL
      );

      const totalTime = Date.now() - startTime;
      this.logger.log(`🎉 Optimized sync completed in ${totalTime}ms`);

      return {
        status: 'completed',
        syncId,
        timing: {
          step1: step1Time,
          step2: step2Time,
          step3: step3Time,
          step4: step4Time,
          total: totalTime,
        },
      };
    } catch (error) {
      this.logger.error('❌ Error during optimized sync:', error);
      throw error;
    } finally {
      await this.redisLockService.release(
        SCHEMA_SYNC_PROCESSING_LOCK_KEY,
        this.schemaReloadService.sourceInstanceId
      );
    }
  }

  private async updateSchemaHistory(syncId: string): Promise<void> {
    try {
      const version = await this.schemaHistoryService.backup();
      this.logger.log(`✅ Schema history updated: ${version}`);
    } catch (error) {
      this.logger.error('❌ Failed to update schema history:', error);
      throw error;
    }
  }

  private async generateEntitiesParallel(): Promise<void> {
    const tables = await this.getTablesWithRelations();

    // Generate entities in parallel for better performance
    const entityPromises = tables.map(async table => {
      try {
        // Use the correct method from AutoService
        await this.autoService.entityGenerate(table);
        return `✅ Generated entity for ${table.name}`;
      } catch (error) {
        this.logger.warn(
          `⚠️ Failed to generate entity for ${table.name}: ${error}`
        );
        return `❌ Failed ${table.name}`;
      }
    });

    const results = await Promise.all(entityPromises);
    results.forEach(result => this.logger.log(result));
  }

  private async generateAndRunMigrationOptimized(): Promise<any> {
    try {
      // Generate migration
      await generateMigrationFile();

      // Try to run migration
      try {
        const result = await runMigration();
        this.logger.log('✅ Migration completed successfully');
        return { status: 'migration_completed', result };
      } catch (migrationError) {
        this.logger.log('⏩ No migration needed or migration failed');
        return { status: 'no_migration_needed' };
      }
    } catch (error) {
      this.logger.error('❌ Migration generation failed:', error);
      throw error;
    }
  }

  private async reloadDataSourceOptimized(): Promise<void> {
    try {
      await this.dataSourceService.reloadDataSource();
      this.logger.log('✅ DataSource reloaded successfully');
    } catch (error) {
      this.logger.error('❌ DataSource reload failed:', error);
      throw error;
    }
  }

  private async getTablesWithRelations(): Promise<any[]> {
    const tableDefRepo =
      this.dataSourceService.getRepository('table_definition');
    if (!tableDefRepo) {
      throw new ResourceNotFoundException('Repository', 'table_definition');
    }

    return await tableDefRepo
      .createQueryBuilder('table')
      .leftJoinAndSelect('table.columns', 'columns')
      .leftJoinAndSelect('table.relations', 'relations')
      .leftJoinAndSelect('relations.targetTable', 'targetTable')
      .getMany();
  }
}
