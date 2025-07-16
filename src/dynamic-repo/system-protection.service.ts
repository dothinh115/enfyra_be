import { Injectable } from '@nestjs/common';
import { isEqual } from 'lodash';
import { CommonService } from '../common/common.service';

@Injectable()
export class SystemProtectionService {
  constructor(private commonService: CommonService) {}

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
    // === 1. route_definition ===
    if (tableName === 'route_definition' && existing?.isSystem) {
      if ('isEnabled' in data && data.isEnabled === false) {
        throw new Error('Không được disable route hệ thống');
      }

      const lockedFields = ['path', 'mainTable'];
      const changed = lockedFields.filter((key) => {
        return key in data && !isEqual(data[key], existing[key]);
      });
      if (changed.length > 0) {
        throw new Error(`Không được sửa field hệ thống: ${changed.join(', ')}`);
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

    if (operation === 'create') {
      this.commonService.assertNoSystemFlagDeep([data]);
    }

    if (operation === 'delete' && existing?.isSystem) {
      throw new Error('Không được xoá bản ghi hệ thống!');
    }
  }
}
