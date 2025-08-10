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
    const e = this.stripRelations(existing, relationFields);

    return Object.keys(d).filter((key) => {
      const isChanged = e && key in e && !isEqual(d[key], e[key]);
      return isChanged;
    });
  }

  private getAllowedFields(base: string[]): string[] {
    return [...new Set([...base, 'createdAt', 'updatedAt'])];
  }

  private async reloadIfSystem(existing: any, tableName: string): Promise<any> {
    if (!existing?.isSystem) return existing;

    const dataSource = this.dataSourceService.getDataSource();
    const meta = dataSource.getMetadata(tableName);
    const repo = dataSource.getRepository(meta.target);
    const relations = this.getAllRelationFieldsWithInverse(tableName);

    const full = await repo.findOne({
      where: { id: existing.id },
      relations,
    });

    if (!full) throw new Error('Full system record not found');
    return full;
  }

  private async assertRelationSystemRecordsNotRemoved(
    tableName: string,
    existing: any,
    newData: any,
  ) {
    const relationFields = this.getAllRelationFieldsWithInverse(tableName);
    if (relationFields.length === 0) return;

    for (const field of relationFields) {
      const oldItems = existing[field];
      const newItems = newData?.[field];

      if (!Array.isArray(oldItems) || !Array.isArray(newItems)) continue;

      const oldSystemIds = oldItems
        .filter((i: any) => i?.isSystem)
        .map((i) => i.id);
      const newIds = newItems.filter((i: any) => i?.id).map((i) => i.id);
      const newCreated = newItems.filter((i: any) => !i?.id);

      for (const id of oldSystemIds) {
        if (!newIds.includes(id)) {
          throw new Error(
            `Cannot delete system record (id=${id}) in relation '${field}'`,
          );
        }
      }

      for (const item of newCreated) {
        if (item?.isSystem) {
          throw new Error(
            `Cannot create new system record in relation '${field}'`,
          );
        }
      }
    }
  }

  async assertSystemSafe({
    operation,
    tableName,
    data,
    existing,
    currentUser,
  }: {
    operation: 'create' | 'update' | 'delete';
    tableName: string;
    data: any;
    existing?: any;
    currentUser?: any;
  }) {
    const fullExisting = await this.reloadIfSystem(existing, tableName);
    const relationFields = this.getAllRelationFieldsWithInverse(tableName);
    const changedFields = this.getChangedFields(
      data,
      fullExisting,
      relationFields,
    );

    if (operation === 'create') {
      this.commonService.assertNoSystemFlagDeep([data]);
    }

    if (operation === 'delete' && fullExisting?.isSystem) {
      throw new Error('Cannot delete system record!');
    }

    if (operation === 'update' && fullExisting?.isSystem) {
      await this.assertRelationSystemRecordsNotRemoved(
        tableName,
        fullExisting,
        data,
      );
    }

    if (tableName === 'route_definition' && fullExisting?.isSystem) {
      const allowed = this.getAllowedFields([
        'description',
        'publishedMethods',
        'icon',
      ]);
      const disallowed = changedFields.filter((f) => !allowed.includes(f));
      if (disallowed.length > 0) {
        throw new Error(
          `Cannot modify system route (only allowed: ${allowed.join(', ')}): ${disallowed.join(', ')}`,
        );
      }

      if ('handlers' in data) {
        const oldIds = (fullExisting.handlers || [])
          .map((h: any) => h.id)
          .sort();
        const newIds = (data.handlers || []).map((h: any) => h.id).sort();
        const isSame =
          oldIds.length === newIds.length &&
          oldIds.every((id, i) => id === newIds[i]);
        if (!isSame)
          throw new Error('Cannot add or modify system route handlers');
      }
    }

    if (tableName === 'hook_definition') {
      if (operation === 'create' && data?.isSystem) {
        throw new Error('Cannot create system hook');
      }
      if (operation === 'update' && fullExisting?.isSystem) {
        const allowed = this.getAllowedFields(['description']);
        const disallowed = changedFields.filter((f) => !allowed.includes(f));
        if (disallowed.length > 0)
          throw new Error(
            `Cannot modify system hook (only allowed: ${allowed.join(', ')}): ${disallowed.join(', ')}`,
          );

        if (
          data.route?.id &&
          fullExisting.route?.id &&
          data.route.id !== fullExisting.route.id
        ) {
          throw new Error(`Cannot change 'route' of system hook`);
        }

        const oldIds = (fullExisting.methods || [])
          .map((m: any) => m.id)
          .sort();
        const newIds = (data.methods || []).map((m: any) => m.id).sort();
        if (!isEqual(oldIds, newIds))
          throw new Error(`Cannot change 'methods' of system hook`);
      }
    }

    if (tableName === 'user_definition') {
      const isRoot = fullExisting?.isRootAdmin;

      if (operation === 'delete' && isRoot)
        throw new Error('Cannot delete Root Admin user');

      if (operation === 'update') {
        if (
          'isRootAdmin' in data &&
          data.isRootAdmin !== fullExisting?.isRootAdmin
        ) {
          throw new Error('Cannot modify isRootAdmin');
        }

        const isSelf = currentUser?.id === fullExisting?.id;

        if (isRoot && !isSelf)
          throw new Error('Only Root Admin can modify themselves');

        if (isSelf) {
          const allowed = this.getAllowedFields(['email', 'password']);
          const disallowed = changedFields.filter((k) => !allowed.includes(k));
          if (disallowed.length > 0)
            throw new Error(
              `Root Admin can only modify: ${allowed.join(', ')}. Violations: ${disallowed.join(', ')}`,
            );
        }
      }
    }

    if (tableName === 'table_definition') {
      const isSystem = fullExisting?.isSystem;
      if (operation === 'create' && data?.isSystem)
        throw new Error('Cannot create new system table!');
      if (operation === 'delete' && isSystem)
        throw new Error('Cannot delete system table!');

      if (operation === 'update' && isSystem) {
        const allowed = this.getAllowedFields(['description']);
        const disallowed = changedFields.filter((k) => !allowed.includes(k));
        if (disallowed.length > 0)
          throw new Error(
            `Cannot modify system table (only allowed: ${allowed.join(', ')}): ${disallowed.join(', ')}`,
          );

        const oldCols = fullExisting.columns || [];
        const newCols = data?.columns || [];
        const oldRels = fullExisting.relations || [];
        const newRels = data?.relations || [];

        const removedCols = oldCols.filter(
          (col) => !newCols.some((c) => c.id === col.id),
        );
        for (const col of removedCols) {
          if (col.isSystem)
            throw new Error(`Cannot delete system column: '${col.name}'`);
        }

        const removedRels = oldRels.filter(
          (rel) => !newRels.some((r) => r.id === rel.id),
        );
        for (const rel of removedRels) {
          if (rel.isSystem)
            throw new Error(
              `Cannot delete system relation: '${rel.propertyName}'`,
            );
        }

        for (const oldCol of oldCols.filter((c) => c.isSystem)) {
          const updated = newCols.find((c) => c.id === oldCol.id);
          if (!updated) continue;
          const allowed = this.getAllowedFields(['description']);
          const changed = Object.keys(updated).filter(
            (key) =>
              !allowed.includes(key) && !isEqual(updated[key], oldCol[key]),
          );
          if (changed.length > 0)
            throw new Error(
              `Cannot modify system column '${oldCol.name}' (only allowed: ${allowed.join(', ')})`,
            );
        }

        for (const oldRel of oldRels.filter((r) => r.isSystem)) {
          const updated = newRels.find((r) => r.id === oldRel.id);
          if (!updated) continue;
          const allowed = this.getAllowedFields(['description']);
          const changed = Object.keys(updated).filter(
            (key) =>
              !allowed.includes(key) && !isEqual(updated[key], oldRel[key]),
          );
          if (changed.length > 0)
            throw new Error(
              `Cannot modify system relation '${oldRel.propertyName}' (only allowed: ${allowed.join(', ')})`,
            );
        }
      }
    }

    if (tableName === 'menu_definition') {
      const isSystem = fullExisting?.isSystem;

      if (operation === 'create' && data?.isSystem) {
        throw new Error('Cannot create new system menu!');
      }

      if (operation === 'delete' && isSystem) {
        throw new Error('Cannot delete system menu!');
      }

      if (operation === 'update' && isSystem) {
        // Chỉ cho phép sửa các trường không quan trọng
        const allowed = this.getAllowedFields([
          'description',
          'icon',
          'isEnabled',
          'order',
          'permission',
        ]);

        const disallowed = changedFields.filter((k) => !allowed.includes(k));
        if (disallowed.length > 0) {
          throw new Error(
            `Cannot modify system menu (only allowed: ${allowed.join(', ')}): ${disallowed.join(', ')}`,
          );
        }

        // Kiểm tra không cho phép thay đổi cấu trúc cơ bản
        if ('type' in data && data.type !== fullExisting.type) {
          throw new Error('Cannot change menu type (mini/menu)');
        }

        if ('label' in data && data.label !== fullExisting.label) {
          throw new Error('Cannot change menu label');
        }

        if ('path' in data && data.path !== fullExisting.path) {
          throw new Error('Cannot change menu path');
        }

        if ('sidebar' in data && data.sidebar !== fullExisting.sidebar) {
          throw new Error('Cannot change menu sidebar reference');
        }

        if ('parent' in data && data.parent !== fullExisting.parent) {
          throw new Error('Cannot change menu parent reference');
        }
      }
    }

    if (tableName === 'extension_definition') {
      const isSystem = fullExisting?.isSystem;

      if (operation === 'create' && data?.isSystem) {
        throw new Error('Cannot create new system extension!');
      }

      if (operation === 'delete' && isSystem) {
        throw new Error('Cannot delete system extension!');
      }

      if (operation === 'update' && isSystem) {
        // Chỉ cho phép sửa các trường không quan trọng
        const allowed = this.getAllowedFields([
          'description',
          'category',
          'version',
          'isEnabled',
          'order',
          'configSchema',
          'dependencies',
          'permissions',
        ]);

        const disallowed = changedFields.filter((k) => !allowed.includes(k));
        if (disallowed.length > 0) {
          throw new Error(
            `Cannot modify system extension (only allowed: ${allowed.join(', ')}): ${disallowed.join(', ')}`,
          );
        }

        // Kiểm tra không cho phép thay đổi cấu trúc cơ bản
        if ('name' in data && data.name !== fullExisting.name) {
          throw new Error('Cannot change extension name');
        }

        if ('slug' in data && data.slug !== fullExisting.slug) {
          throw new Error('Cannot change extension slug');
        }

        if ('type' in data && data.type !== fullExisting.type) {
          throw new Error('Cannot change extension type');
        }

        if (
          'frontendCode' in data &&
          data.frontendCode !== fullExisting.frontendCode
        ) {
          throw new Error('Cannot change system extension frontend code');
        }

        if (
          'backendCode' in data &&
          data.backendCode !== fullExisting.backendCode
        ) {
          throw new Error('Cannot change system extension backend code');
        }
      }
    }
  }
}
