import { Injectable } from '@nestjs/common';

@Injectable()
export class SystemProtectionService {
  checkDeepForSystemFlag(obj, path = 'root') {
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        this.checkDeepForSystemFlag(obj[i], `${path}[${i}]`);
      }
    } else if (typeof obj === 'object' && obj !== null) {
      if ('isSystem' in obj && obj.isSystem === true) {
        throw new Error(`Illegal isSystem=true at ${path}`);
      }
      for (const key of Object.keys(obj)) {
        this.checkDeepForSystemFlag(obj[key], path ? `${path}.${key}` : key);
      }
    }
  }

  assertSystemSafe({ operation, tableName, data, existing, relatedRoute }) {
    this.checkDeepForSystemFlag(data);

    if (operation === 'create' && data?.isSystem === true) {
      throw new Error('Cannot create record with isSystem = true');
    }

    if (operation === 'update' && 'isSystem' in data) {
      throw new Error("Cannot modify field 'isSystem' on any record");
    }

    if (operation === 'delete' && existing?.isSystem) {
      throw new Error('Cannot delete a system record');
    }

    if (operation === 'update' && existing?.isSystem) {
      const forbidden = Object.keys(data).filter((k) => k !== 'description');
      if (forbidden.length > 0) {
        throw new Error(
          `Cannot modify system record fields: ${forbidden.join(', ')}`,
        );
      }
    }

    if (tableName === 'route_handler_definition') {
      if (operation === 'create' && relatedRoute?.isSystem) {
        throw new Error('Cannot create handler on system route');
      }
      if (operation === 'update' && existing && relatedRoute?.isSystem) {
        const forbidden = Object.keys(data).filter((k) =>
          ['logic', 'route', 'method'].includes(k),
        );
        if (forbidden.length > 0) {
          throw new Error(
            `Cannot modify handler field(s): ${forbidden.join(', ')} for system route`,
          );
        }
      }
    }

    if (tableName === 'route_definition' && existing?.isSystem) {
      if ('isEnabled' in data && data.isEnabled === false) {
        throw new Error('Cannot disable a system route');
      }
      const forbidden = Object.keys(data).filter((k) => k !== 'description');
      if (forbidden.length > 0) {
        throw new Error(
          `Cannot modify route_definition system fields: ${forbidden.join(', ')}`,
        );
      }
    }

    if (tableName === 'table_definition' && existing?.isSystem) {
      const forbidden = Object.keys(data).filter((k) => k !== 'description');
      if (forbidden.length > 0) {
        throw new Error(
          `Cannot modify table_definition system fields: ${forbidden.join(', ')}`,
        );
      }
    }

    if (tableName === 'relation_definition') {
      if (operation === 'create' && data?.sourceTable?.isSystem) {
        throw new Error(
          'Cannot create relation with sourceTable from system table',
        );
      }
      if (existing?.isSystem) {
        const forbidden = Object.keys(data).filter((k) => k !== 'description');
        if (forbidden.length > 0) {
          throw new Error(
            `Cannot modify system relation: ${forbidden.join(', ')}`,
          );
        }
      }
    }

    if (tableName === 'column_definition' && existing?.isSystem) {
      const forbidden = Object.keys(data).filter((k) => k !== 'description');
      if (forbidden.length > 0) {
        throw new Error(`Cannot modify system column: ${forbidden.join(', ')}`);
      }
    }

    if (tableName === 'user_definition' && existing?.isRootAdmin) {
      if (operation === 'delete') {
        throw new Error('Cannot delete Root Admin');
      }
      const forbidden = ['isRootAdmin', 'isSystem'];
      const modified = Object.keys(data).filter((k) => forbidden.includes(k));
      if (modified.length > 0) {
        throw new Error(
          `Cannot modify Root Admin fields: ${modified.join(', ')}`,
        );
      }
    }
  }
}
