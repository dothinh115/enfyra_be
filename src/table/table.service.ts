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
    await queryRunner.startTransaction();
    const manager = queryRunner.manager;
    try {
      const hasTable = await queryRunner.hasTable(body.name);
      let result: any = await manager.findOne(tableEntity, {
        where: {
          name: body.name,
        },
      });
      if (hasTable && result) {
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

      // Tạo entity từ dữ liệu đã được xử lý
      const createTableEntity = manager.create(tableEntity, body);

      result = await manager.save(tableEntity, createTableEntity);
      await queryRunner.commitTransaction();
      await this.afterEffect({ entityName: result.name, type: 'create' });
      const routeDefRepo =
        this.dataSourceService.getRepository('route_definition');
      await routeDefRepo.save({
        path: `/${result.name}`,
        mainTable: result.id,
      });
      return result;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error(error.stack || error.message || error);
      throw new Error(`Error: "${error.message}"` || 'Unknown error');
    } finally {
      await queryRunner.release();
    }
  }

  async updateTable(id: number, body: CreateTableDto) {
    const dataSource = this.dataSourceService.getDataSource();
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    const manager = queryRunner.manager;
    const tableEntity =
      this.dataSourceService.entityClassMap.get('table_definition');
    const columnEntity =
      this.dataSourceService.entityClassMap.get('column_definition');
    const relationEntity = this.dataSourceService.entityClassMap.get(
      'relation_definition',
    );
    try {
      const exists: any = await manager.findOne(tableEntity, {
        where: { id },
        relations: ['columns', 'relations'],
      });

      if (!exists) {
        throw new Error(`Table ${body.name} không tồn tại.`);
      }
      if (!body.columns?.some((col) => col.isPrimary)) {
        throw new Error(`Table must contains id column with isPrimary = true!`);
      }

      validateUniquePropertyNames(body.columns || [], body.relations || []);

      const deletedColumnIds = getDeletedIds(exists.columns, body.columns);
      const deletedRelationIds = getDeletedIds(
        exists.relations,
        body.relations,
      );

      if (deletedColumnIds.length) {
        await manager.delete(columnEntity, deletedColumnIds);
      }
      if (deletedRelationIds.length) {
        await manager.delete(relationEntity, deletedRelationIds);
      }

      const result = await manager.save(tableEntity, body);
      await queryRunner.commitTransaction();
      await this.afterEffect({ entityName: result.name, type: 'update' });

      return result;
    } catch (error) {
      await queryRunner.rollbackTransaction();
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
