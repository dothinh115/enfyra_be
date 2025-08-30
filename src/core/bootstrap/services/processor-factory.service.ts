import { Injectable, Logger } from '@nestjs/common';
import { DataSourceService } from '../../../core/database/data-source/data-source.service';
import { BcryptService } from '../../auth/services/bcrypt.service';

export interface ProcessorConfig {
  name: string;
  dependencies: string[];
  priority: number; // Higher priority = loaded first
}

@Injectable()
export class ProcessorFactoryService {
  private readonly logger = new Logger(ProcessorFactoryService.name);
  private readonly processorCache = new Map<string, any>();
  private readonly processorConfigs: ProcessorConfig[] = [];

  constructor(
    private readonly dataSourceService: DataSourceService,
    private readonly bcryptService: BcryptService
  ) {
    this.initializeProcessorConfigs();
  }

  private initializeProcessorConfigs(): void {
    // Define processor configurations with dependencies and priorities
    this.processorConfigs.push(
      {
        name: 'user_definition',
        dependencies: ['bcrypt'],
        priority: 1, // Highest priority - required for auth
      },
      {
        name: 'method_definition',
        dependencies: ['dataSource'],
        priority: 2, // High priority - required for routes
      },
      {
        name: 'setting_definition',
        dependencies: [],
        priority: 3, // High priority - required for config
      },
      {
        name: 'route_definition',
        dependencies: ['dataSource'],
        priority: 4, // Medium priority
      },
      {
        name: 'route_handler_definition',
        dependencies: ['dataSource'],
        priority: 5, // Medium priority
      },
      {
        name: 'menu_definition',
        dependencies: ['dataSource'],
        priority: 6, // Lower priority
      },
      {
        name: 'hook_definition',
        dependencies: ['dataSource'],
        priority: 7, // Lower priority
      },
      {
        name: 'extension_definition',
        dependencies: [],
        priority: 8, // Lower priority
      },
      {
        name: 'folder_definition',
        dependencies: [],
        priority: 9, // Lower priority
      }
    );

    // Sort by priority
    this.processorConfigs.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Get processor by table name with lazy loading
   */
  async getProcessor(tableName: string): Promise<any> {
    // Check cache first
    if (this.processorCache.has(tableName)) {
      return this.processorCache.get(tableName);
    }

    // Find processor config
    const config = this.processorConfigs.find(c => c.name === tableName);
    if (!config) {
      // For now, return null for unknown tables
      this.logger.warn(`⚠️ No processor config found for table: ${tableName}`);
      return null;
    }

    try {
      // For now, return a simple processor object
      // This will be enhanced later when we have proper processor instances
      const processor = {
        name: tableName,
        dependencies: config.dependencies,
        priority: config.priority,
        process: async (records: any[], repo: any, context?: any) => {
          this.logger.log(
            `🔄 Processing ${records.length} records for table: ${tableName}`
          );
          // Simple fallback processing
          return { created: records.length, skipped: 0 };
        },
      };

      this.processorCache.set(tableName, processor);

      this.logger.debug(
        `🔄 Created fallback processor for table: ${tableName} (priority: ${config.priority})`
      );
      return processor;
    } catch (error) {
      this.logger.warn(
        `⚠️ Failed to create processor for ${tableName}: ${error instanceof Error ? error.message : String(error)}`
      );

      // Return null for failed processors
      return null;
    }
  }

  /**
   * Get all processor configurations
   */
  getProcessorConfigs(): ProcessorConfig[] {
    return [...this.processorConfigs];
  }

  /**
   * Get processor statistics
   */
  getProcessorStats() {
    return {
      totalConfigs: this.processorConfigs.length,
      cachedProcessors: this.processorCache.size,
      cacheHitRate: this.processorCache.size / this.processorConfigs.length,
    };
  }

  /**
   * Clear processor cache
   */
  clearCache(): void {
    this.processorCache.clear();
    this.logger.debug('🧹 Processor cache cleared');
  }

  /**
   * Preload essential processors
   */
  async preloadEssentialProcessors(): Promise<void> {
    const essentialTables = [
      'user_definition',
      'method_definition',
      'setting_definition',
    ];

    for (const tableName of essentialTables) {
      await this.getProcessor(tableName);
    }

    this.logger.log('🚀 Essential processors preloaded');
  }
}
