import * as path from 'path';
import { CommonService } from '../common/common.service';
import { createDataSource } from '../data-source/data-source';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource, EntitySchema, EntityTarget, Repository } from 'typeorm';
import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager';
import { RELOADING_DATASOURCE_KEY } from '../utils/constant';

const entityDir = path.resolve('dist', 'entities');

@Injectable()
export class DataSourceService implements OnModuleInit {
  private dataSource: DataSource;
  private logger = new Logger(DataSourceService.name);

  constructor(
    private commonService: CommonService,
    @Inject(CACHE_MANAGER) private cache: Cache,
  ) {}

  async onModuleInit() {
    this.logger.log('Chuẩn bị gán và init DataSource.');

    const entities = await this.commonService.loadDynamicEntities(entityDir);
    this.dataSource = createDataSource(entities);
    await this.dataSource.initialize();
    this.logger.debug('Gán và init DataSource thành công!');
  }

  async reloadDataSource() {
    if (!this.dataSource.isInitialized) {
      this.logger.debug('DataSource chưa init, bỏ qua reload!');
      return;
    }

    this.logger.log('🔁 Chuẩn bị reload DataSource');
    await this.cache.set(RELOADING_DATASOURCE_KEY, true, 10);
    await this.dataSource.destroy();
    this.logger.debug('✅ Destroy DataSource cũ thành công!');

    try {
      const entities = await this.commonService.loadDynamicEntities(entityDir);

      this.dataSource = createDataSource(entities);
      await this.dataSource.initialize();
      this.logger.debug('✅ ReInit DataSource thành công!');
      return this.dataSource;
    } catch (err: any) {
      this.logger.error('❌ Lỗi khi reInit DataSource:', err.message);
      this.logger.error(err.stack || err);
    } finally {
      await this.cache.del(RELOADING_DATASOURCE_KEY);
    }
  }

  async getRepository<Entity>(
    identifier: string | Function | EntitySchema<any>,
  ): Promise<Repository<Entity>> | null {
    const dataSource = await this.getDataSource();
    if (!dataSource?.isInitialized) {
      throw new Error('DataSource chưa được khởi tạo!');
    }

    let metadata;

    if (typeof identifier === 'string') {
      // Tìm theo tên bảng
      metadata = dataSource.entityMetadatas.find(
        (meta) => meta.tableName === identifier,
      );
    } else {
      try {
        metadata = dataSource.getMetadata(identifier);
      } catch {
        return null; // Không tìm thấy metadata
      }
    }

    if (!metadata) {
      return null;
    }

    return dataSource.getRepository<Entity>(metadata.target as any);
  }

  async getDataSource() {
    const cached = await this.cache.get(RELOADING_DATASOURCE_KEY);
    while (cached) {
      await this.commonService.delay(500);
    }
    return this.dataSource;
  }

  getEntityClassByTableName(tableName: string): Function | undefined {
    const entityMetadata = this.dataSource.entityMetadatas.find(
      (meta) =>
        meta.tableName === tableName || meta.givenTableName === tableName,
    );

    return entityMetadata?.target as Function | undefined;
  }

  getTableNameFromEntity(entity: EntityTarget<any>): string {
    const metadata = this.dataSource.getMetadata(entity);
    return metadata.tableName;
  }
}
