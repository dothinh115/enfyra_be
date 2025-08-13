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
    
    const transformedRecords = await Promise.all(
      records.map(async (record) => {
        const mainTable = await tableDefRepo.findOne({
          where: { name: record.mainTable },
        });
        
        if (!mainTable) {
          this.logger.warn(
            `⚠️ Table '${record.mainTable}' not found for route ${record.path}, skipping.`,
          );
          return null;
        }
        
        return {
          ...record,
          mainTable,
        };
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