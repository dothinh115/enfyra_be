import * as path from 'path';
import * as fs from 'fs';
import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { AutoService } from '../auto/auto.service';
import { buildToJs } from '../auto/utils/build-helper';
import {
  generateMigrationFile,
  runMigration,
} from '../auto/utils/migration-helper';
import { SchemaHistoryService } from './schema-history.service';
import { DataSourceService } from '../data-source/data-source.service';
import { clearOldEntitiesJs } from './utils/clear-old-entities';
import { GraphqlService } from '../graphql/graphql.service';

@Injectable()
export class MetadataSyncService {
  private readonly logger = new Logger(MetadataSyncService.name);

  constructor(
    @Inject(forwardRef(() => AutoService))
    private autoService: AutoService,
    private schemaHistoryService: SchemaHistoryService,
    private dataSourceService: DataSourceService,
    private graphqlService: GraphqlService,
  ) {}

  async pullMetadataFromDb() {
    const tableDefRepo =
      this.dataSourceService.getRepository('table_definition');
    if (!tableDefRepo)
      throw new Error('Không tìm thấy repo cho table_definition');

    const tables: any = await tableDefRepo
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

    await Promise.all(
      tables.map(
        async (table) =>
          await this.autoService.entityGenerate(table, inverseRelationMap),
      ),
    );
  }

  async syncAll(options?: {
    entityName?: string;
    fromRestore?: boolean;
    type: 'create' | 'update';
  }) {
    const startTime = Date.now();
    const timings: Record<string, number> = {};

    try {
      // Step 1: Pull metadata + clear migrations (must complete before build)
      const step1Start = Date.now();
      await Promise.all([
        this.pullMetadataFromDb(),
        this.autoService.clearMigrationsTable(),
      ]);
      timings.step1 = Date.now() - step1Start;
      this.logger.debug(
        `Step 1 (Pull metadata + Clear migrations): ${timings.step1}ms`,
      );

      // Step 2: Build JS entities (needs pulled metadata)
      const step2Start = Date.now();
      await buildToJs({
        targetDir: path.resolve('src/entities'),
        outDir: path.resolve('dist/src/entities'),
      });
      timings.step2 = Date.now() - step2Start;
      this.logger.debug(`Step 2 (Build JS entities): ${timings.step2}ms`);

      // Step 3: Generate Migration first (needs built entities)
      const step3Start = Date.now();
      if (options?.type === 'create' || !options?.fromRestore) {
        const migrationStart = Date.now();
        await generateMigrationFile();
        timings.generateMigration = Date.now() - migrationStart;
      } else {
        this.logger.debug(
          'Skipping migration generation for non-structural changes',
        );
        timings.generateMigration = 0;
      }

      // Step 4: Reload services + Run Migration (can run in parallel)
      await Promise.all([
        // Services reload (I/O bound)
        Promise.all([
          this.dataSourceService.reloadDataSource(),
          this.graphqlService.reloadSchema(),
        ]),
        // Run migration (now that it's generated)
        (async () => {
          if (options?.type === 'create' || !options?.fromRestore) {
            const runStart = Date.now();
            await runMigration();
            timings.runMigration = Date.now() - runStart;
          } else {
            this.logger.debug(
              'Skipping migration run for non-structural changes',
            );
            timings.runMigration = 0;
          }
        })(),
      ]);
      timings.step3 = Date.now() - step3Start;
      this.logger.debug(`Step 3-4 (Migration + Reload): ${timings.step3}ms`);

      // Step 5: Backup
      const step4Start = Date.now();
      const version = await this.schemaHistoryService.backup();
      timings.step4 = Date.now() - step4Start;

      timings.total = Date.now() - startTime;
      this.logger.log(`🏁 syncAll completed in ${timings.total}ms`, timings);

      return version;
    } catch (err) {
      this.logger.error(
        '❌ Error synchronizing metadata, restoring previous schema...',
        err,
      );
      await this.schemaHistoryService.restore({
        entityName: options?.entityName,
        type: options?.type,
      });
      this.logger.error('🛑 THROWING error after restore');

      throw new BadRequestException(
        err.message ??
          `Something went wrong, check your table schema again....`,
      );
    }
  }
}
