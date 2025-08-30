import { Injectable } from '@nestjs/common';
import { BaseTableProcessor } from './base-table-processor';
import { DataSourceService } from '../../../core/database/data-source/data-source.service';

@Injectable()
export class MethodDefinitionProcessor extends BaseTableProcessor {
  constructor(private readonly dataSourceService: DataSourceService) {
    super();
  }

  async transformRecords(records: any[]): Promise<any[]> {
    const settingRepo =
      this.dataSourceService.getRepository('setting_definition');

    // Try to find any setting, but don't require it
    let setting = null;
    try {
      setting = await settingRepo.findOne({
        where: { isSystem: true }, // Look for system settings first
      });

      // If no system setting found, try to find any setting
      if (!setting) {
        setting = await settingRepo.findOne({
          where: { id: 1 }, // Try to find first setting
        });
      }
    } catch (error) {
      // Setting is optional, so ignore errors
      this.logger.debug(
        'No setting found, continuing without setting reference'
      );
    }

    // Setting is optional for methods
    return records.map(record => ({
      ...record,
      setting: setting || null,
      isSystem: this.isValidSystemFlag(record.isSystem),
    }));
  }

  private isValidSystemFlag(isSystem: any): boolean {
    return typeof isSystem === 'boolean' ? isSystem : true;
  }

  getUniqueIdentifier(record: any): object {
    return { method: record.method };
  }

  protected getCompareFields(): string[] {
    return ['method', 'isSystem'];
  }
}
