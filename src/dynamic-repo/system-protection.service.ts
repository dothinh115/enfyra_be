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

  private getAllRelationFieldsWithInverse(tableName: string): string[] {
    try {
      const dataSource = this.dataSourceService.getDataSource();
      const meta = dataSource.getMetadata(tableName);
      const relations = meta.relations.map((r) => r.propertyName);

      const inverseRelations: string[] = [];
      for (const otherMeta of dataSource.entityMetadatas) {
        for (const r of otherMeta.relations) {
          if (
            r.inverseEntityMetadata.name === meta.name &&
            r.inverseSidePropertyPath
          ) {
            inverseRelations.push(r.inverseSidePropertyPath.split('.')[0]);
          }
        }
      }

      return [...new Set([...relations, ...inverseRelations])];
    } catch {
      return [];
    }
  }

  private stripRelations(data: any, relationFields: string[]): any {
    if (!data) return data;
    const result: any = {};
    for (const key of Object.keys(data)) {
      if (!relationFields.includes(key)) {
        result[key] = data[key];
      }
    }
    return result;
  }

  private getChangedFields(
    data: any,
    existing: any,
    relationFields: string[],
  ): string[] {
    const d = this.stripRelations(data, relationFields);
    const e = this.stripRelations(existing, relationFields) || {};

    return Object.keys(d).filter((key) => {
      const isChanged = key in e && !isEqual(d[key], e[key]);
      return isChanged;
    });
  }

  private getAllowedFields(base: string[]): string[] {
    return [...new Set([...base, 'createdAt', 'updatedAt'])];
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
    const relationFields = this.getAllRelationFieldsWithInverse(tableName);
    const changedFields = this.getChangedFields(data, existing, relationFields);

    // === 1. route_definition ===
    if (tableName === 'route_definition' && existing?.isSystem) {
      const allowed = this.getAllowedFields([
        'description',
        'publishedMethods',
      ]);
      const changedDisallowed = changedFields.filter(
        (key) => !allowed.includes(key),
      );

      if (changedDisallowed.length > 0) {
        throw new Error(
          `Không được sửa route hệ thống (chỉ cho phép cập nhật: ${allowed.join(', ')}): ${changedDisallowed.join(', ')}`,
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

    // === 3. Chỉ kiểm tra gán isSystem khi tạo mới
    if (operation === 'create') {
      this.commonService.assertNoSystemFlagDeep([data]);
    }

    // === 4. Xoá bản ghi hệ thống
    if (operation === 'delete' && existing?.isSystem) {
      throw new Error('Không được xoá bản ghi hệ thống!');
    }

    // === 5. hook_definition ===
    if (tableName === 'hook_definition') {
      if (operation === 'create' && data?.isSystem) {
        throw new Error('Không được phép tạo hook hệ thống');
      }

      if (operation === 'update' && existing?.isSystem) {
        const allowed = this.getAllowedFields(['description']);
        const changedDisallowedFields = changedFields.filter(
          (f) => !allowed.includes(f),
        );

        if (changedDisallowedFields.length > 0) {
          throw new Error(
            `Không được sửa hook hệ thống (chỉ cho phép cập nhật: ${allowed.join(', ')}): ${changedDisallowedFields.join(', ')}`,
          );
        }

        if (
          data.route?.id &&
          existing.route?.id &&
          data.route.id !== existing.route.id
        ) {
          throw new Error(`Không được đổi 'route' của hook hệ thống`);
        }

        const oldMethodIds = (existing.methods ?? []).map((m) => m.id).sort();
        const newMethodIds = (data.methods ?? []).map((m) => m.id).sort();
        if (!isEqual(oldMethodIds, newMethodIds)) {
          throw new Error(`Không được đổi 'methods' của hook hệ thống`);
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
          const allowed = this.getAllowedFields(['email', 'password']);
          const changedDisallowed = changedFields.filter(
            (k) => !allowed.includes(k),
          );

          if (changedDisallowed.length > 0) {
            throw new Error(
              `Root Admin chỉ được sửa các trường: ${allowed.join(', ')}. Vi phạm: ${changedDisallowed.join(', ')}`,
            );
          }
        }
      }
    }
  }
}
