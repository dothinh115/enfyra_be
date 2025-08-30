import { Injectable } from '@nestjs/common';
import { BaseTableProcessor } from './base-table-processor';

@Injectable()
export class ExtensionDefinitionProcessor extends BaseTableProcessor {
  getUniqueIdentifier(record: any): object[] {
    // Extension can be identified by multiple strategies
    const identifiers = [];

    // Primary: by extensionId if provided
    if (record.extensionId) {
      identifiers.push({ extensionId: record.extensionId });
    }

    // Secondary: by name
    if (record.name) {
      identifiers.push({ name: record.name });
    }

    // Tertiary: by menu relation if it's a one-to-one
    if (record.menu) {
      identifiers.push({ menu: record.menu });
    }

    if (identifiers.length > 0) {
      return identifiers;
    }

    // Fallback to id if available
    if (record.id !== undefined && record.id !== null) {
      return [{ id: record.id }];
    }

    // If no valid identifier found, return empty array (will find first record)
    return [{}];
  }

  protected getCompareFields(): string[] {
    return [
      'name',
      'type',
      'version',
      'isEnabled',
      'description',
      'code',
      'compiledCode',
    ];
  }
}
