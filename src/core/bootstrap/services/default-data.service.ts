import { Injectable, Logger } from '@nestjs/common';
import { DataSourceService } from '../../../core/database/data-source/data-source.service';
import { BcryptService } from '../../auth/services/bcrypt.service';
import * as fs from 'fs';
import * as path from 'path';

// Import processors
import { BaseTableProcessor } from '../processors/base-table-processor';
import { UserDefinitionProcessor } from '../processors/user-definition.processor';
import { MenuDefinitionProcessor } from '../processors/menu-definition.processor';
import { RouteDefinitionProcessor } from '../processors/route-definition.processor';
import { MethodDefinitionProcessor } from '../processors/method-definition.processor';
import { HookDefinitionProcessor } from '../processors/hook-definition.processor';
import { GenericTableProcessor } from '../processors/generic-table.processor';

const initJson = JSON.parse(
  fs.readFileSync(
    path.join(process.cwd(), 'src/core/bootstrap/data/init.json'),
    'utf8',
  ),
);

@Injectable()
export class DefaultDataService {
  private readonly logger = new Logger(DefaultDataService.name);
  private readonly processors = new Map<string, BaseTableProcessor>();

  constructor(
    private readonly dataSourceService: DataSourceService,
    private readonly bcryptService: BcryptService,
    // Inject specific processors
    private readonly userProcessor: UserDefinitionProcessor,
    private readonly menuProcessor: MenuDefinitionProcessor,
    private readonly routeProcessor: RouteDefinitionProcessor,
    private readonly methodProcessor: MethodDefinitionProcessor,
    private readonly hookProcessor: HookDefinitionProcessor,
  ) {
    this.initializeProcessors();
  }

  private initializeProcessors(): void {
    // Register specific processors
    this.processors.set('user_definition', this.userProcessor);
    this.processors.set('menu_definition', this.menuProcessor);
    this.processors.set('route_definition', this.routeProcessor);
    this.processors.set('method_definition', this.methodProcessor);
    this.processors.set('hook_definition', this.hookProcessor);
    
    // Generic processors for other tables
    const genericTables = [
      'table_definition',
      'role_definition', 
      'setting_definition',
      'session_definition',
      'column_definition',
      'relation_definition',
      'route_permission_definition',
      'route_handler_definition',
      'extension_definition',
    ];

    for (const tableName of genericTables) {
      this.processors.set(tableName, new GenericTableProcessor(tableName));
    }
  }

  async insertAllDefaultRecords(): Promise<void> {
    this.logger.log('🚀 Starting default data upsert with refactored processors...');
    
    let totalCreated = 0;
    let totalSkipped = 0;

    for (const [tableName, rawRecords] of Object.entries(initJson)) {
      const processor = this.processors.get(tableName);
      if (!processor) {
        this.logger.warn(`⚠️ No processor found for table '${tableName}', skipping.`);
        continue;
      }

      if (!rawRecords || (Array.isArray(rawRecords) && rawRecords.length === 0)) {
        this.logger.debug(`❎ Table '${tableName}' has no default data, skipping.`);
        continue;
      }

      this.logger.log(`🔄 Processing table '${tableName}'...`);

      try {
        const repo = this.dataSourceService.getRepository(tableName);
        const records = Array.isArray(rawRecords) ? rawRecords : [rawRecords];
        
        // Special context for menu processor
        const context = tableName === 'menu_definition' ? { repo } : undefined;
        
        const result = await processor.process(records, repo, context);
        
        totalCreated += result.created;
        totalSkipped += result.skipped;
        
        this.logger.log(
          `✅ Completed '${tableName}': ${result.created} created, ${result.skipped} skipped`
        );
      } catch (error) {
        this.logger.error(`❌ Error processing table '${tableName}': ${error.message}`);
        this.logger.debug(`Error details:`, error);
      }
    }

    this.logger.log(
      `🎉 Default data upsert completed! Total: ${totalCreated} created, ${totalSkipped} skipped`
    );
  }
}