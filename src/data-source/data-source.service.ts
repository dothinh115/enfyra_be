import * as path from 'path';
import { CommonService } from '../common/common.service';
import { createDataSource } from '../data-source/data-source';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource, EntitySchema, Repository } from 'typeorm';
import { QueryTrackerService } from '../query-track/query-track.service';

const dynamicEntityDir = path.resolve(__dirname, '..', 'dynamic-entities');
const entityDir = path.resolve(__dirname, '..', 'entities');

@Injectable()
export class DataSourceService implements OnModuleInit {
  private dataSource: DataSource;
  private logger = new Logger(DataSourceService.name);

  constructor(
    private commonService: CommonService,
    private queryTrackerService: QueryTrackerService,
  ) {}

  async onModuleInit() {
    this.logger.log('Chuẩn bị gán và init DataSource.');

    const entities = [
      ...(await this.commonService.loadDynamicEntities(dynamicEntityDir)),
      ...(await this.commonService.loadDynamicEntities(entityDir)),
    ];
    this.dataSource = createDataSource(entities);
    await this.dataSource.initialize();
    this.logger.debug('Gán và init DataSource thành công!');
  }

  async reloadDataSource() {
    if (!this.dataSource.isInitialized) {
      this.logger.debug('DataSource chưa init, bỏ qua reload!');
      return;
    }

    const interval = 500;
    const maxCount = 20;
    let count = 0;

    while (!this.queryTrackerService.isIdle()) {
      if (count >= maxCount) {
        this.logger.error(
          `❌ DataSource vẫn đang bận sau ${(maxCount * interval) / 1000}s, huỷ reload.`,
        );
        return; // hoặc throw error nếu muốn retry lại từ client
      }

      this.logger.debug(
        `DataSource đang bận, còn ${this.queryTrackerService.getCount()} kết nối...${count > 0 ? `, thử lại ${count}/${maxCount} lần...` : ''}`,
      );

      count++;
      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    this.logger.log('🔁 Chuẩn bị reload DataSource');
    await this.dataSource.destroy();
    this.logger.debug('✅ Destroy DataSource cũ thành công!');

    try {
      const entities = [
        ...(await this.commonService.loadDynamicEntities(dynamicEntityDir)),
        ...(await this.commonService.loadDynamicEntities(entityDir)),
      ];

      this.dataSource = createDataSource(entities);
      await this.dataSource.initialize();
      this.logger.debug('✅ ReInit DataSource thành công!');
      return this.dataSource;
    } catch (err: any) {
      this.logger.error('❌ Lỗi khi reInit DataSource:', err.message);
      this.logger.error(err.stack || err);
    }
  }

  getRepository<Entity>(
    identifier: string | Function | EntitySchema<any>,
  ): Repository<Entity> | null {
    if (!this.dataSource?.isInitialized) {
      throw new Error('DataSource chưa được khởi tạo!');
    }

    let metadata;

    if (typeof identifier === 'string') {
      // Tìm theo tên bảng
      metadata = this.dataSource.entityMetadatas.find(
        (meta) => meta.tableName === identifier,
      );
    } else {
      try {
        metadata = this.dataSource.getMetadata(identifier);
      } catch {
        return null; // Không tìm thấy metadata
      }
    }

    if (!metadata) {
      return null;
    }

    return this.dataSource.getRepository<Entity>(metadata.target as any);
  }

  getDataSource() {
    return this.dataSource;
  }
}
