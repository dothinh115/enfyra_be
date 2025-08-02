import * as path from 'path';
import { CommonService } from '../common/common.service';
import { createDataSource } from '../data-source/data-source';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource, EntitySchema, EntityTarget, Repository } from 'typeorm';

const entityDir = path.resolve('dist', 'src', 'entities');

@Injectable()
export class DataSourceService implements OnModuleInit {
  private dataSource: DataSource;
  private logger = new Logger(DataSourceService.name);
  entityClassMap: Map<string, Function> = new Map();

  constructor(private commonService: CommonService) {}

  async onModuleInit() {
    this.logger.log('Preparing to assign and initialize DataSource.');
    await this.reloadDataSource();
    this.logger.debug('DataSource assignment and initialization successful!');
  }

  async reloadDataSource() {
    this.logger.log('🔁 Preparing to reload DataSource');

    try {
      const entities = await this.commonService.loadDynamicEntities(entityDir);
      const newDataSource = createDataSource(entities);
      await newDataSource.initialize();
      this.logger.debug('✅ DataSource reinitialization successful!');

      if (this.dataSource?.isInitialized) {
        await this.dataSource.destroy();
        this.clearMetadata();
        this.logger.debug('✅ Old DataSource destroyed successfully!');
      }
      this.dataSource = newDataSource;
      entities.forEach((entityClass) => {
        const name = this.getTableNameFromEntity(entityClass);
        this.entityClassMap.set(name, entityClass);
      });
      return this.dataSource;
    } catch (error: any) {
      this.logger.error('❌ Error during DataSource reinitialization:', error.message);
      this.logger.error(error.stack || error);
      throw error;
    }
  }

  getRepository<Entity>(
    identifier: string | Function | EntitySchema<any>,
  ): Repository<Entity> | null {
    if (!this.dataSource?.isInitialized) {
      throw new Error('DataSource is not initialized!');
    }

    let metadata;

    if (typeof identifier === 'string') {
      // Find by table name
      metadata = this.dataSource.entityMetadatas.find(
        (meta) => meta.tableName === identifier,
      );
    } else {
      try {
        metadata = this.dataSource.getMetadata(identifier);
      } catch {
        return null; // Metadata not found
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

  getEntityClassByTableName(tableName: string): Function | undefined {
    const entityMetadata = this.dataSource.entityMetadatas.find(
      (meta) =>
        meta.tableName.toLowerCase() === tableName.toLowerCase() ||
        meta.givenTableName?.toLowerCase() === tableName.toLowerCase(),
    );

    return entityMetadata?.target as Function | undefined;
  }

  getTableNameFromEntity(entity: EntityTarget<any>): string {
    const metadata = this.dataSource.getMetadata(entity);
    return metadata.tableName;
  }

  clearMetadata() {
    (this.dataSource as any).entityMetadatas = [];
    (this.dataSource as any).entityMetadatasMap = new Map();
    (this.dataSource as any).repositories = [];
  }
}
