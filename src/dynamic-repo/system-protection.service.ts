import { Injectable } from '@nestjs/common';
import { isEqual } from 'lodash';
import { CommonService } from '../common/common.service';
import { DataSourceService } from '../data-source/data-source.service';

@Injectable()
export class SystemProtectionService {
  constructor(
    private commonService: CommonService,
    private dataSourceService: DataSourceService,
  ) {}

  private getRelationFields(tableName: string): string[] {
    try {
      const dataSource = this.dataSourceService.getDataSource();
      const meta = dataSource.getMetadata(tableName);
      return meta.relations.map((r) => r.propertyName);
    } catch {
      return [];
    }
  }

  private stripRelations(data: any, relationFields: string[]): any {
    if (!data) return data;
    const clean = { ...data };
    for (const field of relationFields) {
      delete clean[field];
    }
    return clean;
  }

  assertSystemSafe({
    operation,
    tableName,
    data,
    existing,
    relatedRoute,
    currentUser,
  }: {
    operation: 'create' | 'update' | 'delete';
    tableName: string;
    data: any;
    existing?: any;
    relatedRoute?: any;
    currentUser?: any;
  }) {
    const relationFields = this.getRelationFields(tableName);
    const dataWithoutRelations = this.stripRelations(data, relationFields);
    const existingWithoutRelations = this.stripRelations(
      existing,
      relationFields,
    );

    // === 1. route_definition ===
    if (tableName === 'route_definition' && existing?.isSystem) {
      const allowedFields = [
        'description',
        'createdAt',
        'updatedAt',
        'publishedMethods',
      ];

      const changedDisallowedFields = Object.keys(dataWithoutRelations).filter(
        (key) => {
          const isChanged =
            key in existingWithoutRelations &&
            !isEqual(dataWithoutRelations[key], existingWithoutRelations[key]);
          return isChanged && !allowedFields.includes(key);
        },
      );

      if (changedDisallowedFields.length > 0) {
        throw new Error(
          `Không được sửa route hệ thống (chỉ cho phép cập nhật: ${allowedFields.join(', ')}): ${changedDisallowedFields.join(', ')}`,
        );
      }

      if ('handlers' in data) {
        const oldIds = (existing.handlers || []).map((h: any) => h.id).sort();
        const newIds = (data.handlers || []).map((h: any) => h.id).sort();
        const isSame =
          oldIds.length === newIds.length &&
          oldIds.every((id: any, i: number) => id === newIds[i]);

        if (!isSame) {
          throw new Error(
            `Không được thêm hoặc thay đổi handlers của route hệ thống`,
          );
        }
      }
    }

    // === 2. route_handler_definition ===
    if (tableName === 'route_handler_definition' && relatedRoute?.isSystem) {
      throw new Error(
        'Không được thao tác handler trên route hệ thống (cấm cả tạo và sửa)',
      );
    }

    // === 3. Tạo mới — không được gán isSystem
    if (operation === 'create') {
      this.commonService.assertNoSystemFlagDeep([data]);
    }

    // === 4. Xoá bản ghi hệ thống
    if (operation === 'delete' && existing?.isSystem) {
      throw new Error('Không được xoá bản ghi hệ thống!');
    }

    // === 5. hook_definition ===
    if (tableName === 'hook_definition') {
      if (operation === 'create') {
        if (data?.isSystem) {
          throw new Error('Không được phép tạo hook hệ thống');
        }
      }

      if (operation === 'update' && existing?.isSystem) {
        const allowedFields = ['description', 'createdAt', 'updatedAt'];
        const changedDisallowedFields = Object.keys(data).filter((key) => {
          if (!(key in existing)) return false;
          const isChanged = !isEqual(data[key], existing[key]);
          return isChanged && !allowedFields.includes(key);
        });

        if (changedDisallowedFields.length > 0) {
          throw new Error(
            `Không được sửa hook hệ thống (chỉ cho phép cập nhật 'description'): ${changedDisallowedFields.join(', ')}`,
          );
        }
      }
    }

    // === 6. user_definition — bảo vệ root admin
    if (tableName === 'user_definition') {
      const isTargetRoot = existing?.isRootAdmin === true;

      if (operation === 'delete' && isTargetRoot) {
        throw new Error('Không được xoá user Root Admin');
      }

      if (operation === 'update') {
        if (
          'isRootAdmin' in data &&
          data.isRootAdmin !== existing?.isRootAdmin
        ) {
          throw new Error('Không được chỉnh sửa isRootAdmin');
        }

        const isSelf = currentUser?.id === existing?.id;

        if (isTargetRoot && !isSelf) {
          throw new Error('Chỉ Root Admin mới được sửa chính họ');
        }

        if (isSelf) {
          const allowedFields = ['email', 'password'];
          const changedDisallowed = Object.keys(data).filter((k) => {
            const isChanged = k in existing && !isEqual(data[k], existing[k]);
            return isChanged && !allowedFields.includes(k);
          });

          if (changedDisallowed.length > 0) {
            throw new Error(
              `Root Admin chỉ được sửa các trường: ${allowedFields.join(', ')}. Vi phạm: ${changedDisallowed.join(', ')}`,
            );
          }
        }
      }
    }
  }
}
