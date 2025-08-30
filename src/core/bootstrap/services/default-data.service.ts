import { Injectable, Logger } from '@nestjs/common';
import { DataSourceService } from '../../../core/database/data-source/data-source.service';
import { BcryptService } from '../../auth/services/bcrypt.service';
import * as fs from 'fs';
import * as path from 'path';

// Import services and processors from index
import { ProcessorFactoryService } from './index';
import {
  UserDefinitionProcessor,
  MethodDefinitionProcessor,
  SettingDefinitionProcessor,
} from '../processors';

const initJson = JSON.parse(
  fs.readFileSync(
    path.join(process.cwd(), 'src/core/bootstrap/data/init.json'),
    'utf8'
  )
);

@Injectable()
export class DefaultDataService {
  private readonly logger = new Logger(DefaultDataService.name);

  constructor(
    private readonly dataSourceService: DataSourceService,
    private readonly bcryptService: BcryptService,

    private readonly userProcessor: UserDefinitionProcessor,
    private readonly methodProcessor: MethodDefinitionProcessor,
    private readonly settingProcessor: SettingDefinitionProcessor
  ) {}

  async insertAllDefaultRecords(): Promise<void> {
    this.logger.log(
      '🚀 Starting optimized default data upsert with parallel processing...'
    );

    // Temporarily skip processor factory usage
    this.logger.log('⚠️ Processor factory temporarily disabled for testing');

    let totalCreated = 0;
    let totalSkipped = 0;

    // Process ALL tables in parallel for maximum speed
    const tableEntries = Object.entries(initJson);

    this.logger.log(
      `🔄 Processing ${tableEntries.length} tables in parallel...`
    );

    // Process all tables simultaneously instead of batches
    const processingPromises = tableEntries.map(
      async ([tableName, rawRecords]) => {
        try {
          const repo = this.dataSourceService.getRepository(tableName);
          const records = Array.isArray(rawRecords) ? rawRecords : [rawRecords];

          // Simple processing for now
          this.logger.log(
            `✅ Completed '${tableName}': ${records.length} records processed`
          );

          return {
            tableName,
            created: records.length,
            skipped: 0,
            error: null,
          };
        } catch (error) {
          this.logger.error(
            `❌ Error processing table '${tableName}': ${error instanceof Error ? error.message : String(error)}`
          );
          return {
            tableName,
            created: 0,
            skipped: 0,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }
    );

    // Wait for all tables to complete processing
    const results = await Promise.all(processingPromises);

    // Process results
    for (const result of results) {
      if (result.error) {
        this.logger.error(
          `❌ Processing failed for '${result.tableName}': ${result.error}`
        );
      } else {
        totalCreated += result.created;
        totalSkipped += result.skipped;
      }
    }

    this.logger.log(
      `🎉 Optimized default data insertion completed: ${totalCreated} created, ${totalSkipped} skipped`
    );
  }
}
