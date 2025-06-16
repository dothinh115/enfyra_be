import { AutoService } from '../auto/auto.service';
import { Table_definition } from '../entities/table_definition.entity';
import { CreateColumnDto, CreateTableDto } from '../table/dto/create-table.dto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSourceService } from '../data-source/data-source.service';
import { SchemaReloadService } from '../schema/schema-reload.service';
import { SchemaStateService } from '../schema/schema-state.service';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { MetadataSyncService } from '../metadata/metadata-sync.service';
import { SchemaHistoryService } from '../metadata/schema-history.service';

@Injectable()
export class TableHandlerService {
  constructor(
    private dataSouceService: DataSourceService,
    private autoService: AutoService,
    private schemaReloadService: SchemaReloadService,
    private schemaStateService: SchemaStateService,
    @InjectDataSource() private dataSource: DataSource,
    private metadataSyncService: MetadataSyncService,
    private schemaHistoryService: SchemaHistoryService,
  ) {}

  async createTable(body: CreateTableDto) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    const manager = queryRunner.manager;
    try {
      const hasTable = await queryRunner.hasTable(body.name);
      let result = await manager.findOne(Table_definition, {
        where: {
          name: body.name,
        },
      });
      if (hasTable && result) {
        throw new BadRequestException(`Bảng ${body.name} đã tồn tại!`);
      }

      // Tạo entity từ dữ liệu đã được xử lý
      const tableEntity = manager.create(Table_definition, {
        columns: this.normalizeColumnsWithAutoId(body.columns),
        ...body,
      } as any);

      result = await manager.save(Table_definition, tableEntity);
      await queryRunner.commitTransaction();
      await this.metadataSyncService.syncAll();
      const routeDefRepo =
        this.dataSouceService.getRepository('route_definition');
      await routeDefRepo.save({
        path: `/${result.name}`,
        mainTable: result.id,
      });
      return result;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error(error.stack || error.message || error);
      throw new BadRequestException(
        `Error: "${error.message}"` || 'Unknown error',
      );
    } finally {
      await queryRunner.release();
    }
  }

  async updateTable(id: number, body: CreateTableDto) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    const manager = queryRunner.manager;

    try {
      const exists = await manager.findOne(Table_definition, {
        where: { id },
        relations: ['columns', 'relations'],
      });

      if (!exists) {
        throw new BadRequestException(`Table ${body.name} không tồn tại.`);
      }
      const result = await manager.save(Table_definition, body as any);
      await queryRunner.commitTransaction();
      await this.metadataSyncService.syncAll();
      return result;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error(error.stack || error.message || error);
      throw new BadRequestException(
        `Error: "${error.message}"` || 'Unknown error',
      );
    } finally {
      await queryRunner.release();
    }
  }

  normalizeColumnsWithAutoId(columns: CreateColumnDto[]): CreateColumnDto[] {
    // Tìm xem user có cố gắng định nghĩa cột id không
    const userIdCol = columns.find((col) => col.name === 'id');
    const idType =
      userIdCol?.type === 'varchar' || userIdCol?.type === 'uuid'
        ? 'uuid'
        : 'int';

    // Loại bỏ cột id do user định nghĩa
    const filtered = columns.filter((col) => col.name !== 'id');

    // Tạo cột id chuẩn
    const idColumn: CreateColumnDto =
      idType === 'uuid'
        ? {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            isGenerated: true,
            isNullable: false,
          }
        : {
            name: 'id',
            type: 'int',
            isPrimary: true,
            isGenerated: true,
            isNullable: false,
          };

    // Trả về kết quả
    return [idColumn, ...filtered];
  }

  async delete(id: number) {
    const tableDefRepo: any =
      this.dataSouceService.getRepository('table_definition');
    try {
      const exists = await tableDefRepo.findOne({
        where: { id },
      });

      if (!exists) {
        throw new BadRequestException(`Table với id ${id} không tồn tại.`);
      }

      if (exists.isSystem) {
        throw new BadRequestException(
          `Không thể xoá bảng static (${exists.name}).`,
        );
      }

      const result = await tableDefRepo.remove(exists);
      await this.metadataSyncService.syncAll();

      return result;
    } catch (error) {
      console.error(error.stack || error.message || error);
      throw new BadRequestException(
        `Error: "${error.message}"` || 'Unknown error',
      );
    }
  }
}
