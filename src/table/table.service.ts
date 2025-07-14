import { CreateTableDto } from '../table/dto/create-table.dto';
import { Injectable, Logger } from '@nestjs/common';
import { DataSourceService } from '../data-source/data-source.service';
import { MetadataSyncService } from '../metadata/metadata-sync.service';
import { SchemaReloadService } from '../schema/schema-reload.service';
import { CommonService } from '../common/common.service';
import { validateUniquePropertyNames } from './utils/duplicate-field-check';
import { getDeletedIds } from './utils/get-deleted-ids';

@Injectable()
export class TableHandlerService {
  private logger = new Logger(TableHandlerService.name);

  constructor(
    private dataSourceService: DataSourceService,
    private metadataSyncService: MetadataSyncService,
    private schemaReloadService: SchemaReloadService,
    private commonService: CommonService,
  ) {}

  async createTable(body: CreateTableDto) {
    const dataSource = this.dataSourceService.getDataSource();
    const tableEntity =
      this.dataSourceService.entityClassMap.get('table_definition');

    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      const hasTable = await queryRunner.hasTable(body.name);

      const existing = await dataSource.getRepository(tableEntity).findOne({
        where: { name: body.name },
      });

      if (hasTable && existing) {
        throw new Error(`Bảng ${body.name} đã tồn tại!`);
      }

      const idCol = body.columns.find(
        (col) => col.name === 'id' && col.isPrimary,
      );
      if (!idCol) {
        throw new Error(
          `Table must contain a column named "id" with isPrimary = true.`,
        );
      }

      const validTypes = ['int', 'uuid'];
      if (!validTypes.includes(idCol.type)) {
        throw new Error(`The primary column "id" must be of type int, uuid.`);
      }

      const primaryCount = body.columns.filter((col) => col.isPrimary).length;
      if (primaryCount !== 1) {
        throw new Error(`Only one column is allowed to have isPrimary = true.`);
      }

      validateUniquePropertyNames(body.columns || [], body.relations || []);

      const result = await dataSource
        .getRepository(tableEntity)
        .save(dataSource.getRepository(tableEntity).create(body));

      await this.afterEffect({ entityName: result.name, type: 'create' });

      const routeDefRepo =
        this.dataSourceService.getRepository('route_definition');
      await routeDefRepo.save({
        path: `/${result.name}`,
        mainTable: result.id,
        isEnabled: true,
      });

      return result;
    } catch (error) {
      console.error(error.stack || error.message || error);
      throw new Error(`Error: "${error.message}"` || 'Unknown error');
    } finally {
      await queryRunner.release();
    }
  }

  async updateTable(id: number, body: CreateTableDto) {
    const dataSource = this.dataSourceService.getDataSource();

    const tableEntity =
      this.dataSourceService.entityClassMap.get('table_definition');
    const columnEntity =
      this.dataSourceService.entityClassMap.get('column_definition');
    const relationEntity = this.dataSourceService.entityClassMap.get(
      'relation_definition',
    );

    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      const tableRepo = dataSource.getRepository(tableEntity);
      const columnRepo = dataSource.getRepository(columnEntity);
      const relationRepo = dataSource.getRepository(relationEntity);

      const exists: any = await tableRepo.findOne({
        where: { id },
        relations: ['columns', 'relations'],
      });

      if (!exists) {
        throw new Error(`Table ${body.name} không tồn tại.`);
      }

      // Validation cơ bản: phải có 1 primary key
      if (!body.columns?.some((col) => col.isPrimary)) {
        throw new Error(
          `Table must contain an id column with isPrimary = true!`,
        );
      }

      validateUniquePropertyNames(body.columns || [], body.relations || []);

      // 🚨 Nếu là bảng hệ thống, bảo vệ nghiêm ngặt
      if (exists.isSystem) {
        // 1. Không được xoá column/relation hệ thống
        const deletedColumnIds = getDeletedIds(exists.columns, body.columns);
        const deletedRelationIds = getDeletedIds(
          exists.relations,
          body.relations,
        );

        if (deletedColumnIds.length > 0) {
          const deletedNames = exists.columns
            .filter((c) => deletedColumnIds.includes(c.id))
            .map((c) => c.name);
          throw new Error(
            `Không được xoá column hệ thống: ${deletedNames.join(', ')}`,
          );
        }

        if (deletedRelationIds.length > 0) {
          const deletedNames = exists.relations
            .filter((r) => deletedRelationIds.includes(r.id))
            .map((r) => r.propertyName);
          throw new Error(
            `Không được xoá relation hệ thống: ${deletedNames.join(', ')}`,
          );
        }

        // 2. Không được sửa field bảng ngoài description
        const forbiddenTableFields = Object.keys(body).filter(
          (k) => !['description', 'columns', 'relations'].includes(k),
        );
        if (forbiddenTableFields.length > 0) {
          throw new Error(
            `Không được sửa bảng hệ thống: ${forbiddenTableFields.join(', ')}`,
          );
        }

        // 3. Không được sửa column gốc
        for (const oldCol of exists.columns) {
          const updated = body.columns.find((c) => c.id === oldCol.id);
          if (!updated) continue; // Đã xử lý xoá ở trên
          const safeKeys = ['description', 'isSystem', 'id']; // bỏ qua
          const changed = Object.keys(updated).some((key) => {
            if (safeKeys.includes(key)) return false;
            return JSON.stringify(updated[key]) !== JSON.stringify(oldCol[key]);
          });
          if (changed) {
            throw new Error(`Không được sửa column hệ thống: ${oldCol.name}`);
          }
        }

        // 4. Không được sửa relation gốc
        for (const oldRel of exists.relations) {
          const updated = body.relations.find((r) => r.id === oldRel.id);
          if (!updated) continue;
          const safeKeys = ['description', 'isSystem', 'id'];
          const changed = Object.keys(updated).some((key) => {
            if (safeKeys.includes(key)) return false;
            return JSON.stringify(updated[key]) !== JSON.stringify(oldRel[key]);
          });
          if (changed) {
            throw new Error(
              `Không được sửa relation hệ thống: ${oldRel.propertyName}`,
            );
          }
        }

        // 5. Không được nhồi isSystem = true trong bản ghi mới
        this.commonService.assertNoSystemFlagDeep(body.columns, 'columns');
        this.commonService.assertNoSystemFlagDeep(body.relations, 'relations');
      }

      // Nếu qua được tất cả check —> tiến hành cập nhật
      const result = await tableRepo.save(
        tableRepo.create({
          ...body,
          id: exists.id,
        }),
      );

      // Gọi afterEffect để reload schema
      await this.afterEffect({ entityName: result.name, type: 'update' });
      return result;
    } catch (error) {
      console.error(error.stack || error.message || error);
      throw new Error(`Error: "${error.message}"` || 'Unknown error');
    } finally {
      await queryRunner.release();
    }
  }

  async delete(id: number) {
    const tableDefRepo: any =
      this.dataSourceService.getRepository('table_definition');
    try {
      const exists = await tableDefRepo.findOne({
        where: { id },
      });

      if (!exists) {
        throw new Error(`Table với id ${id} không tồn tại.`);
      }

      if (exists.isSystem) {
        throw new Error(`Không thể xoá bảng static (${exists.name}).`);
      }

      const result = await tableDefRepo.remove(exists);
      await this.afterEffect(result.name);
      return result;
    } catch (error) {
      console.error(error.stack || error.message || error);
      throw new Error(`Error: "${error.message}"` || 'Unknown error');
    }
  }

  async afterEffect(options: {
    entityName: string;
    type: 'create' | 'update';
  }) {
    try {
      this.logger.warn('⏳ Locking schema for sync...');
      await this.schemaReloadService.lockSchema();
      const version = await this.metadataSyncService.syncAll({
        entityName: options.entityName,
        type: options?.type,
      });
      await this.schemaReloadService.publishSchemaUpdated(version);
      await this.commonService.delay(1000);
      this.logger.log('✅ Unlocking schema');
      await this.schemaReloadService.unlockSchema();
    } catch (error) {
      this.logger.error('❌ Lỗi trong afterEffect khi đồng bộ schema:', error);
      await this.schemaReloadService.unlockSchema();
      throw error;
    }
  }
}
