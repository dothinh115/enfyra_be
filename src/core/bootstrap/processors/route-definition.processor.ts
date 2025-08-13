import { Injectable } from '@nestjs/common';
import { BaseTableProcessor } from './base-table-processor';
import { DataSourceService } from '../../../core/database/data-source/data-source.service';

@Injectable()
export class RouteDefinitionProcessor extends BaseTableProcessor {
  constructor(private readonly dataSourceService: DataSourceService) {
    super();
  }

  async transformRecords(records: any[]): Promise<any[]> {
    const tableDefRepo = this.dataSourceService.getRepository('table_definition');
    const methodRepo = this.dataSourceService.getRepository('method_definition');
    
    const transformedRecords = await Promise.all(
      records.map(async (record) => {
        const transformedRecord = { ...record };
        
        // Handle mainTable reference
        const mainTable = await tableDefRepo.findOne({
          where: { name: record.mainTable },
        });
        
        if (!mainTable) {
          this.logger.warn(
            `⚠️ Table '${record.mainTable}' not found for route ${record.path}, skipping.`,
          );
          return null;
        }
        
        transformedRecord.mainTable = mainTable;
        
        // Handle publishedMethods - convert string array to method entities
        if (record.publishedMethods && Array.isArray(record.publishedMethods)) {
          const methodEntities = await methodRepo.find({
            where: record.publishedMethods.map((method: string) => ({ method }))
          });
          
          if (methodEntities.length !== record.publishedMethods.length) {
            const foundMethods = methodEntities.map((m: any) => m.method);
            const notFound = record.publishedMethods.filter((m: string) => !foundMethods.includes(m));
            this.logger.warn(
              `⚠️ Method(s) '${notFound.join(', ')}' not found for route ${record.path}`,
            );
          }
          
          transformedRecord.publishedMethods = methodEntities;
          this.logger.debug(`🔗 Route ${record.path} linked to methods: ${methodEntities.map((m: any) => m.method).join(', ')}`);
        }
        
        return transformedRecord;
      }),
    );

    // Filter out null records (where mainTable wasn't found)
    return transformedRecords.filter(Boolean);
  }

  getUniqueIdentifier(record: any): object {
    return { path: record.path };
  }

  // TODO: Uncomment when update logic is restored
  // protected getCompareFields(): string[] {
  //   return ['path', 'isEnabled', 'icon', 'description'];
  // }
}