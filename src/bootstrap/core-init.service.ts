import { Injectable, Logger } from '@nestjs/common';
import { DataSourceService } from '../data-source/data-source.service';
import * as path from 'path';

@Injectable()
export class CoreInitService {
  private readonly logger = new Logger(CoreInitService.name);

  constructor(private readonly dataSourceService: DataSourceService) {}

  async waitForDatabaseConnection(
    maxRetries = 10,
    delayMs = 1000,
  ): Promise<void> {
    const dataSource = this.dataSourceService.getDataSource();

    for (let i = 0; i < maxRetries; i++) {
      try {
        await dataSource.query('SELECT 1');
        this.logger.log('Database connection successful.');
        return;
      } catch (error) {
        this.logger.warn(`Unable to connect to DB, retrying after ${delayMs}ms...`);
        await new Promise((res) => setTimeout(res, delayMs));
      }
    }

    throw new Error(`Unable to connect to DB after ${maxRetries} attempts.`);
  }

  async createInitMetadata(): Promise<void> {
    const snapshot = await import(path.resolve('data/snapshot.json'));
    const dataSource = this.dataSourceService.getDataSource();
    const queryRunner = dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const tableNameToId: Record<string, number> = {};
      const tableDefRepo =
        this.dataSourceService.getRepository('table_definition');
      // Phase 1: Insert empty tables
      for (const [name, defRaw] of Object.entries(snapshot)) {
        const def = defRaw as any;

        const exist: any = await queryRunner.manager.findOne(
          tableDefRepo.target,
          {
            where: { name: def.name },
          },
        );

        if (exist) {
          tableNameToId[name] = exist.id;
          this.logger.log(`⏩ Skip ${name}, already exists`);
        } else {
          const { columns, relations, ...rest } = def;
          const created = await queryRunner.manager.save(
            tableDefRepo.target,
            rest,
          );
          tableNameToId[name] = created.id;
          this.logger.log(`✅ Created empty table: ${name}`);
        }
      }

      // Phase 2: Add missing columns
      for (const [name, defRaw] of Object.entries(snapshot)) {
        const def = defRaw as any;
        const tableId = tableNameToId[name];
        if (!tableId) continue;

        const columnEntity =
          this.dataSourceService.entityClassMap.get('column_definition');

        const existingColumns = await queryRunner.manager
          .getRepository(columnEntity)
          .createQueryBuilder('c')
          .leftJoin('c.table', 't')
          .where('t.id = :tableId', { tableId })
          .select(['c.name AS name'])
          .getRawMany();

        const existingNames = new Set(existingColumns.map((col) => col.name));

        const newColumns = (def.columns || []).filter(
          (col: any) => col.name && !existingNames.has(col.name),
        );

        if (newColumns.length) {
          const toInsert = newColumns.map((col: any) => ({
            ...col,
            table: { id: tableId },
          }));
          await queryRunner.manager.save(columnEntity, toInsert);
          this.logger.log(
            `📌 Added ${newColumns.length} new columns for ${name}`,
          );
        } else {
          this.logger.log(`⏩ No columns to add for ${name}`);
        }
      }

      // Phase 3: Add missing relations
      for (const [name, defRaw] of Object.entries(snapshot)) {
        const def = defRaw as any;
        const tableId = tableNameToId[name];
        if (!tableId) continue;

        const relationEntity = this.dataSourceService.entityClassMap.get(
          'relation_definition',
        );

        const existingRelations = await queryRunner.manager
          .getRepository(relationEntity)
          .createQueryBuilder('r')
          .leftJoin('r.sourceTable', 'source')
          .leftJoin('r.targetTable', 'target')
          .select([
            'r.propertyName AS propertyName',
            'source.id AS sourceId',
            'target.id AS targetId',
            'r.type AS relationType',
          ])
          .where('source.id = :tableId', { tableId })
          .getRawMany();

        const existingKeys = new Set(
          existingRelations.map((r) =>
            JSON.stringify({
              sourceTable: r.sourceId,
              targetTable: r.targetId,
              propertyName: r.propertyName,
              relationType: r.relationType,
            }),
          ),
        );

        const newRelations = [];

        for (const rel of def.relations || []) {
          if (!rel.propertyName || !rel.targetTable || !rel.type) continue;
          const targetId = tableNameToId[rel.targetTable];
          if (!targetId) continue;

          const key = JSON.stringify({
            sourceTable: tableId,
            targetTable: targetId,
            propertyName: rel.propertyName,
            relationType: rel.type,
          });

          if (existingKeys.has(key)) continue;

          newRelations.push({
            ...rel,
            sourceTable: { id: tableId },
            targetTable: { id: targetId },
          });
        }

        if (newRelations.length) {
          await queryRunner.manager.save(relationEntity, newRelations);
          this.logger.log(
            `📌 Added ${newRelations.length} new relations for ${name}`,
          );
        } else {
          this.logger.log(`⏩ No relations to add for ${name}`);
        }
      }

      await queryRunner.commitTransaction();
      this.logger.log('🎉 createInitMetadata completed!');
    } catch (err) {
      await queryRunner.rollbackTransaction();
      this.logger.error('💥 Error running createInitMetadata:', err);
      throw err;
    } finally {
      await queryRunner.release();
    }
  }
}
