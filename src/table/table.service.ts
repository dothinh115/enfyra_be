import { AutoService } from '../auto/auto-entity.service';
import { Table_definition } from '../entities/table_definition.entity';
import {
  CreateColumnDto,
  CreateRelationDto,
  CreateTableDto,
} from '../table/dto/create-table.dto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSourceService } from '../data-source/data-source.service';
import { SchemaReloadService } from '../schema/schema-reload.service';
import { SchemaStateService } from '../schema/schema-state.service';
import { Column_definition } from '../entities/column_definition.entity';
import { Relation_definition } from '../entities/relation_definition.entity';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class TableHandlerService {
  constructor(
    private dataSouceService: DataSourceService,
    private autoService: AutoService,
    private schemaReloadService: SchemaReloadService,
    private schemaStateService: SchemaStateService,
    @InjectDataSource() private dataSource: DataSource,
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
        name: body.name,
        columns: this.normalizeColumnsWithAutoId(body.columns),
        relations: body.relations ? this.prepareRelations(body.relations) : [],
      } as any);

      if (!result) result = await manager.save(Table_definition, tableEntity);
      await queryRunner.commitTransaction();
      await this.afterEffect();

      return result;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error(error.stack || error.message || error);
      throw new BadRequestException(
        `Error: "${error.message}", rollback` || 'Unknown error',
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
      await this.afterEffect();
      return result;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error(error.stack || error.message || error);
      throw new BadRequestException(
        `Error: "${error.message}", rollback` || 'Unknown error',
      );
    } finally {
      await queryRunner.release();
    }
  }

  prepareRelations(relationsDto: CreateRelationDto[] = []) {
    const result = relationsDto.map((relation) => ({
      ...relation,
      ...(relation.targetTable && {
        targetTable: { id: relation.targetTable },
      }),
    }));
    return result;
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
      await this.afterEffect();
      return result;
    } catch (error) {
      console.error(error.stack || error.message || error);
      throw new BadRequestException(
        `Error: "${error.message}", rollback` || 'Unknown error',
      );
    }
  }

  async afterEffect() {
    try {
      //lock ko cho đổi schema
      await this.schemaReloadService.lockChangeSchema();
      //pull metadata mới về và apply
      await this.autoService.pullMetadataFromDb();
      //backup version hiện tại
      const backup = await this.autoService.backup();
      this.schemaStateService.setVersion(backup['id']);
      await this.schemaReloadService.publishSchemaUpdated(backup['id']);
    } catch (error) {
      await this.autoService.restore();
      throw error;
    }
  }
}
