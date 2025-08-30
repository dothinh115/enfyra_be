import { Injectable, Logger } from '@nestjs/common';
import { DataSourceService } from '../../../core/database/data-source/data-source.service';
import * as path from 'path';

@Injectable()
export class CoreInitService {
  private readonly logger = new Logger(CoreInitService.name);

  constructor(private readonly dataSourceService: DataSourceService) {}

  async waitForDatabaseConnection(
    maxRetries = 5,
    delayMs = 500
  ): Promise<void> {
    const dataSource = this.dataSourceService.getDataSource();

    for (let i = 0; i < maxRetries; i++) {
      try {
        await dataSource.query('SELECT 1');
        this.logger.log('Database connection successful.');
        return;
      } catch (error) {
        this.logger.warn(
          `Unable to connect to DB, retrying after ${delayMs}ms...`
        );
        await new Promise(res => setTimeout(res, delayMs));
      }
    }

    throw new Error(`Unable to connect to DB after ${maxRetries} attempts.`);
  }

  async createInitMetadata(): Promise<void> {
    this.logger.log('🚀 Starting optimized metadata initialization...');
    const startTime = Date.now();

    const snapshot = await import(path.resolve('data/snapshot.json'));
    const dataSource = this.dataSourceService.getDataSource();
    const queryRunner = dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const tableNameToId: Record<string, number> = {};
      const tableDefRepo =
        this.dataSourceService.getRepository('table_definition');

      // Phase 1: Insert empty tables - optimized batch processing
      const tableEntries = Object.entries(snapshot);
      this.logger.log(`🔄 Processing ${tableEntries.length} tables...`);

      // Process tables in parallel for better performance
      const tablePromises = tableEntries.map(async ([name, defRaw]) => {
        const def = defRaw as any;
        const exist: any = await queryRunner.manager.findOne(
          tableDefRepo.target,
          { where: { name: def.name } }
        );

        if (exist) {
          tableNameToId[name] = exist.id;
          const { columns, relations, ...rest } = def;
          const hasTableChanges = this.detectTableChanges(rest, exist);

          if (hasTableChanges) {
            await queryRunner.manager.save(tableDefRepo.target, {
              ...rest,
              id: exist.id,
            });
            return `🔄 Updated table ${name}`;
          } else {
            return `⏩ Skip ${name}`;
          }
        } else {
          const { columns, relations, ...rest } = def;
          const created = await queryRunner.manager.save(
            tableDefRepo.target,
            rest
          );
          tableNameToId[name] = created.id;
          return `✅ Created table: ${name}`;
        }
      });

      // Wait for all table operations to complete
      const tableResults = await Promise.all(tablePromises);
      tableResults.forEach(result => this.logger.log(result));

      // Phase 2: Add missing columns and update existing ones
      this.logger.log('🔄 Processing columns and relations...');

      // Process columns and relations in parallel
      const columnPromises = tableEntries.map(async ([name, defRaw]) => {
        const def = defRaw as any;
        const tableId = tableNameToId[name];
        if (!tableId) return;

        const columnEntity =
          this.dataSourceService.entityClassMap.get('column_definition');

        const existingColumns = await queryRunner.manager
          .getRepository(columnEntity)
          .createQueryBuilder('c')
          .leftJoin('c.table', 't')
          .where('t.id = :tableId', { tableId })
          .select(['c.id AS id', 'c.name AS name'])
          .getRawMany();

        // Process columns in parallel
        const columnOperations = (def.columns || []).map(async (col: any) => {
          const existing = existingColumns.find(c => c.name === col.name);
          if (existing) {
            await queryRunner.manager.save(columnEntity, {
              ...col,
              id: existing.id,
              table: { id: tableId },
            });
            return `🔄 Updated column ${col.name}`;
          } else {
            await queryRunner.manager.save(columnEntity, {
              ...col,
              table: { id: tableId },
            });
            return `✅ Created column ${col.name}`;
          }
        });

        const columnResults = await Promise.all(columnOperations);
        return columnResults;
      });

      // Wait for all column operations to complete
      const columnResults = await Promise.all(columnPromises);
      columnResults.flat().forEach(result => {
        if (result) this.logger.log(result);
      });

      await queryRunner.commitTransaction();

      const totalTime = Date.now() - startTime;
      this.logger.log(`🎉 Metadata initialization completed in ${totalTime}ms`);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('❌ Error during metadata initialization:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private detectTableChanges(snapshotTable: any, existingTable: any): boolean {
    // Compare table-level properties
    const hasChanges =
      snapshotTable.isSystem !== existingTable.isSystem ||
      snapshotTable.alias !== existingTable.alias ||
      snapshotTable.description !== existingTable.description ||
      JSON.stringify(snapshotTable.uniques) !==
        JSON.stringify(existingTable.uniques) ||
      JSON.stringify(snapshotTable.indexes) !==
        JSON.stringify(existingTable.indexes);

    return hasChanges;
  }

  private detectColumnChanges(snapshotCol: any, existingCol: any): boolean {
    // Compare all relevant column properties (removed isUnique and isIndex)
    const hasChanges =
      snapshotCol.type !== existingCol.type ||
      snapshotCol.isNullable !== existingCol.isNullable ||
      snapshotCol.isPrimary !== existingCol.isPrimary ||
      snapshotCol.isGenerated !== existingCol.isGenerated ||
      snapshotCol.defaultValue !== existingCol.defaultValue ||
      JSON.stringify(snapshotCol.options) !==
        JSON.stringify(existingCol.options) ||
      snapshotCol.isUpdatable !== existingCol.isUpdatable;

    return hasChanges;
  }
}
