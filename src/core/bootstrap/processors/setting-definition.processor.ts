import { Injectable } from '@nestjs/common';
import { BaseTableProcessor } from './base-table-processor';

@Injectable()
export class SettingDefinitionProcessor extends BaseTableProcessor {
  getUniqueIdentifier(record: any): object {
    // Setting table should have only one record - find first one
    // Use isInit field to identify the main setting record
    if (record.isInit !== undefined) {
      return { isInit: record.isInit };
    }
    // Fallback to id if available
    if (record.id !== undefined) {
      return { id: record.id };
    }
    // Last resort - empty object (will find first record)
    return {};
  }

  protected getCompareFields(): string[] {
    return ['isInit', 'projectName', 'projectDescription', 'projectUrl'];
  }
}
