import { Injectable } from '@nestjs/common';
import { BaseTableProcessor } from './base-table-processor';

@Injectable()
export class GenericTableProcessor extends BaseTableProcessor {
  constructor(private readonly tableName: string) {
    super();
  }

  getUniqueIdentifier(record: any): object {
    // Map table names to their unique identifiers
    const uniqueKeyMap: Record<string, string | string[]> = {
      'table_definition': 'name',
      'role_definition': 'name', 
      'setting_definition': 'key',
      'session_definition': 'name',
      'column_definition': ['table', 'name'],
      'relation_definition': ['table', 'name'],
      'route_permission_definition': ['route', 'role'],
      'route_handler_definition': ['route', 'method'],
      'extension_definition': 'name',
    };

    const uniqueKey = uniqueKeyMap[this.tableName];
    
    if (!uniqueKey) {
      // Default fallback - try common fields
      if (record.name !== undefined) return { name: record.name };
      if (record.id !== undefined) return { id: record.id };
      // Last resort - return the whole record as identifier (will likely create duplicates)
      return record;
    }

    if (Array.isArray(uniqueKey)) {
      // Composite key
      const whereCondition: any = {};
      for (const key of uniqueKey) {
        whereCondition[key] = record[key];
      }
      return whereCondition;
    }

    // Single key
    return { [uniqueKey]: record[uniqueKey] };
  }

  // TODO: Uncomment when update logic is restored
  // protected getCompareFields(): string[] {
  //   const fieldMap: Record<string, string[]> = {
  //     'role_definition': ['name', 'description'],
  //     'setting_definition': ['projectName', 'projectDescription', 'projectUrl'],
  //     'route_permission_definition': ['isEnabled'],
  //     'route_handler_definition': ['description', 'logic'],
  //     'extension_definition': ['name', 'type', 'version', 'isEnabled', 'description', 'code'],
  //   };
  //   
  //   return fieldMap[this.tableName] || ['name', 'description'];
  // }
}