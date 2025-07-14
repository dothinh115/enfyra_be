import { Injectable } from '@nestjs/common';

@Injectable()
export class SystemProtectionService {
  checkDeepForSystemFlag(obj: any, path = 'root') {
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        this.checkDeepForSystemFlag(obj[i], `${path}[${i}]`);
      }
    } else if (typeof obj === 'object' && obj !== null) {
      if ('isSystem' in obj && obj.isSystem === true) {
        throw new Error(`Illegal isSystem=true at ${path}`);
      }
      for (const key of Object.keys(obj)) {
        this.checkDeepForSystemFlag(obj[key], `${path}.${key}`);
      }
    }
  }

  assertSystemSafe({
    operation,
    tableName,
    data,
    existing,
    relatedRoute,
  }: {
    operation: 'create' | 'update' | 'delete';
    tableName: string;
    data: any;
    existing?: any;
    relatedRoute?: any;
  }) {
    // Check toàn bộ payload không được có isSystem = true ở bất kỳ đâu
    this.checkDeepForSystemFlag(data);

    if (operation === 'create' && data?.isSystem === true) {
      throw new Error('Cannot create record with isSystem = true');
    }

    if (operation === 'update' && 'isSystem' in data) {
      throw new Error("Cannot modify field 'isSystem'");
    }

    if (operation === 'delete' && existing?.isSystem) {
      throw new Error('Cannot delete a system record');
    }

    // Không cho sửa bất kỳ field nào ngoại trừ 'description' nếu là system
    if (operation === 'update' && existing?.isSystem) {
      const forbidden = Object.keys(data).filter((k) => k !== 'description');
      if (forbidden.length > 0) {
        throw new Error(`Cannot modify system fields: ${forbidden.join(', ')}`);
      }
    }

    // Route handler không được tạo trên system route
    if (tableName === 'route_handler_definition') {
      if (operation === 'create' && relatedRoute?.isSystem) {
        throw new Error('Cannot create handler on a system route');
      }
      if (operation === 'update' && existing && relatedRoute?.isSystem) {
        const forbidden = Object.keys(data).filter((k) =>
          ['logic', 'route', 'method'].includes(k),
        );
        if (forbidden.length > 0) {
          throw new Error(
            `Cannot modify handler fields: ${forbidden.join(', ')} for system route`,
          );
        }
      }
    }

    // Hook/middleware cũng không được sửa route system
    if (
      ['hook_definition', 'middleware_definition'].includes(tableName) &&
      operation === 'update' &&
      relatedRoute?.isSystem &&
      'route' in data
    ) {
      throw new Error(`Cannot reassign system route in ${tableName}`);
    }

    // Không cho disable route system
    if (tableName === 'route_definition' && existing?.isSystem) {
      if ('isEnabled' in data && data.isEnabled === false) {
        throw new Error('Cannot disable system route');
      }
      const forbidden = Object.keys(data).filter((k) => k !== 'description');
      if (forbidden.length > 0) {
        throw new Error(
          `Cannot modify route_definition system fields: ${forbidden.join(', ')}`,
        );
      }
    }

    // Không cho sửa schema bảng system
    if (tableName === 'table_definition' && existing?.isSystem) {
      const forbidden = Object.keys(data).filter((k) => k !== 'description');
      if (forbidden.length > 0) {
        throw new Error(
          `Cannot modify table_definition system fields: ${forbidden.join(', ')}`,
        );
      }
    }

    // Cấm tạo relation từ bảng system (sourceTable là bảng system)
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

    // Cấm sửa column system
    if (tableName === 'column_definition' && existing?.isSystem) {
      const forbidden = Object.keys(data).filter((k) => k !== 'description');
      if (forbidden.length > 0) {
        throw new Error(`Cannot modify system column: ${forbidden.join(', ')}`);
      }
    }

    // Cấm xoá hoặc sửa quyền root
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

    // Setting: chỉ cấm isSystem, isInit
    if (tableName === 'setting_definition') {
      const forbidden = ['isSystem', 'isInit'];
      const modified = Object.keys(data).filter((k) => forbidden.includes(k));
      if (modified.length > 0) {
        throw new Error(
          `Cannot modify system setting fields: ${modified.join(', ')}`,
        );
      }
    }
  }
}
