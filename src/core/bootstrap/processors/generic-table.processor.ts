import { Injectable } from '@nestjs/common';
import { BaseTableProcessor } from './base-table-processor';

@Injectable()
export class GenericTableProcessor extends BaseTableProcessor {
  constructor(private readonly tableName: string) {
    super();
  }

  getUniqueIdentifier(record: any): object | object[] {
    // Dynamic unique identifier strategy - try multiple approaches
    const identifiers: object[] = [];

    // Debug logging for route_handler_definition table
    if (this.tableName === 'route_handler_definition') {
      this.logger.debug(
        `🔍 Processing route_handler_definition record: ${JSON.stringify(record)}`
      );
    }

    // Strategy 1: Table-specific known patterns (keep some for critical tables)
    const criticalUniqueKeys: Record<string, string | string[]> = {
      column_definition: ['table', 'name'],
      relation_definition: ['table', 'propertyName'],
      route_permission_definition: ['route', 'role'],
      route_handler_definition: ['route', 'method'], // Use 'method' not 'methodId'
    };

    const knownKey = criticalUniqueKeys[this.tableName];
    if (knownKey) {
      if (Array.isArray(knownKey)) {
        const whereCondition: any = {};
        for (const key of knownKey) {
          if (
            record[key] !== undefined &&
            this.isValidIdentifierValue(record[key], key)
          ) {
            whereCondition[key] = record[key];
          }
        }
        if (Object.keys(whereCondition).length > 0) {
          identifiers.push(whereCondition);
        }
      } else {
        if (
          record[knownKey] !== undefined &&
          this.isValidIdentifierValue(record[knownKey], knownKey)
        ) {
          identifiers.push({ [knownKey]: record[knownKey] });
        }
      }
    }

    // Special handling for route_handler_definition to avoid methodId issues
    if (this.tableName === 'route_handler_definition') {
      // Only use route and method fields, ignore methodId
      const routeHandlerCondition: any = {};
      if (record.route && this.isValidIdentifierValue(record.route, 'route')) {
        routeHandlerCondition.route = record.route;
      }
      if (record.method && this.isValidMethodValue(record.method)) {
        routeHandlerCondition.method = record.method;
      }

      if (Object.keys(routeHandlerCondition).length > 0) {
        // Replace any existing identifiers with this safe one
        identifiers.length = 0;
        identifiers.push(routeHandlerCondition);
        this.logger.debug(
          `🔍 Using safe route handler condition: ${JSON.stringify(routeHandlerCondition)}`
        );
        return identifiers[0]; // Return immediately to avoid other strategies
      }
    }

    // Strategy 2: Try common unique fields in order of preference
    const commonUniqueFields = [
      'name',
      'username',
      'email',
      'method',
      'path',
      'label',
      'key',
    ];
    for (const field of commonUniqueFields) {
      if (record[field] !== undefined) {
        let isValid = false;

        // Special handling for method field
        if (field === 'method') {
          isValid = this.isValidMethodValue(record[field]);
        } else {
          isValid = this.isValidIdentifierValue(record[field], field);
        }

        if (isValid) {
          identifiers.push({ [field]: record[field] });
        }
      }
    }

    // Strategy 3: Try ID if available
    if (
      record.id !== undefined &&
      this.isValidIdentifierValue(record.id, 'id')
    ) {
      identifiers.push({ id: record.id });
    }

    // Strategy 4: Composite keys for common patterns
    if (
      record.name &&
      record.type &&
      this.isValidIdentifierValue(record.name, 'name') &&
      this.isValidIdentifierValue(record.type, 'type')
    ) {
      identifiers.push({ name: record.name, type: record.type });
    }

    // Strategy 5: Fallback to first non-null property
    if (identifiers.length === 0) {
      const firstKey = Object.keys(record).find(
        key =>
          record[key] !== null &&
          record[key] !== undefined &&
          key !== 'createdAt' &&
          key !== 'updatedAt' &&
          this.isValidIdentifierValue(record[key], key)
      );
      if (firstKey) {
        identifiers.push({ [firstKey]: record[firstKey] });
      }
    }

    // Return multiple strategies for the base processor to try, or single fallback
    if (this.tableName === 'route_handler_definition') {
      this.logger.debug(`🔍 Final identifiers: ${JSON.stringify(identifiers)}`);
    }

    if (identifiers.length > 1) {
      return identifiers;
    }

    if (identifiers.length === 1) {
      return identifiers[0];
    }

    // Last resort fallback - only if id exists and is valid
    if (
      record.id !== undefined &&
      record.id !== null &&
      this.isValidIdentifierValue(record.id, 'id')
    ) {
      return { id: record.id };
    }

    // If no valid identifier found, return empty object (will find first record)
    return {};
  }

  private isValidIdentifierValue(value: any, fieldName?: string): boolean {
    // Skip values that are not suitable for database queries
    if (value === null || value === undefined) return false;

    // Skip complex objects and arrays
    if (typeof value === 'object' && !Array.isArray(value)) return false;
    if (Array.isArray(value) && value.length === 0) return false;

    // Special handling for ID fields
    if (fieldName && this.isIdField(fieldName)) {
      const isValid = this.isValidIdValue(value);
      if (this.tableName === 'route_handler_definition') {
        this.logger.debug(
          `🔍 ID Field validation: ${fieldName} = ${value} -> ${isValid}`
        );
      }
      return isValid;
    }

    // Skip values that look like paths or complex strings
    if (typeof value === 'string') {
      // Skip paths with parameters like /assets/:id
      if (value.includes('/:') || value.includes('*')) return false;
      // Skip very long strings
      if (value.length > 100) return false;
      // Skip HTTP methods and other non-ID strings
      if (
        ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'].includes(
          value
        )
      )
        return false;
    }

    return true;
  }

  private isIdField(fieldName: string): boolean {
    return (
      fieldName.toLowerCase().endsWith('id') || fieldName.toLowerCase() === 'id'
    );
  }

  private isValidIdValue(value: any): boolean {
    // ID fields should be numbers or valid string IDs
    if (typeof value === 'number') return true;
    if (typeof value === 'string') {
      // Allow numeric strings
      if (/^\d+$/.test(value)) return true;
      // Allow UUID-like strings
      if (
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          value
        )
      )
        return true;
      // Skip HTTP methods and other non-ID strings
      if (
        ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'].includes(
          value
        )
      )
        return false;
    }
    return false;
  }

  private isValidMethodValue(value: any): boolean {
    // Method field can accept HTTP methods
    if (typeof value === 'string') {
      return [
        'GET',
        'POST',
        'PUT',
        'DELETE',
        'PATCH',
        'OPTIONS',
        'HEAD',
      ].includes(value);
    }
    return false;
  }

  protected getCompareFields(): string[] {
    const fieldMap: Record<string, string[]> = {
      role_definition: ['name', 'description'],
      setting_definition: ['projectName', 'projectDescription', 'projectUrl'],
      route_permission_definition: ['isEnabled'],
      route_handler_definition: ['description', 'logic'],
      extension_definition: [
        'name',
        'type',
        'version',
        'isEnabled',
        'description',
        'code',
      ],
      folder_definition: ['name', 'order', 'icon', 'description'],
    };

    return fieldMap[this.tableName] || ['name', 'description'];
  }
}
