import { Injectable } from '@nestjs/common';
import { BaseTableProcessor } from './base-table-processor';
import { DataSourceService } from '../../../core/database/data-source/data-source.service';

@Injectable()
export class MethodDefinitionProcessor extends BaseTableProcessor {
  constructor(private readonly dataSourceService: DataSourceService) {
    super();
  }

  async transformRecords(records: any[]): Promise<any[]> {
    const settingRepo = this.dataSourceService.getRepository('setting_definition');
    const setting = await settingRepo.findOne({ where: {} });
    
    if (!setting) {
      this.logger.warn(`⚠️ No settings to assign permissions, skipping method_definition.`);
      return [];
    }

    return records.map((record) => ({
      ...record,
      setting,
      isSystem: true,
    }));
  }

  getUniqueIdentifier(record: any): object {
    return { method: record.method };
  }

  // TODO: Uncomment when update logic is restored
  // protected getCompareFields(): string[] {
  //   return ['method', 'isSystem'];
  // }
}