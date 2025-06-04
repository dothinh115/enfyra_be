import { AutoService } from '../auto/auto.service';
import { Table_definition } from '../entities/table_definition.entity';
import {
  CreateColumnDto,
  CreateRelationDto,
  CreateTableDto,
} from '../table/dto/create-table.dto';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DataSourceService } from '../data-source/data-source.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QueryService } from '../query/query.service';
import { TQuery } from '../utils/type';

@Injectable()
export class TableHanlderService {
  constructor(
    private dataSouceService: DataSourceService,
    private autoService: AutoService,
    @InjectRepository(Table_definition)
    private tableDefRepo: Repository<Table_definition>,
    private queryService: QueryService,
  ) {}

  async createTable(body: CreateTableDto) {
    const queryRunner = this.dataSouceService
      .getDataSource()
      .createQueryRunner();
    await queryRunner.connect(); // Kết nối
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
      await this.autoService.pullMetadataFromDb();

      return result;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error(error.stack || error.message || error);
      throw new BadRequestException(error.message || 'Unknown error');
    } finally {
      await queryRunner.release();
    }
  }

  async updateTable(id: number, body: CreateTableDto) {
    const queryRunner = this.dataSouceService
      .getDataSource()
      .createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    const manager = queryRunner.manager;

    try {
      const exists = await manager.findOne(Table_definition, {
        where: { id },
        relations: ['columns', 'relations'],
      });
      console.dir(exists, { depth: null });

      if (!exists) {
        throw new BadRequestException(`Table ${body.name} không tồn tại.`);
      }

      const oldColumns = exists.columns;
      const oldRelations = exists.relations;

      const newColumns = body.columns || [];
      const newRelations = body.relations || [];

      // Detect deleted columns
      for (const oldCol of oldColumns) {
        const stillExists = newColumns.find((col) => col.id === oldCol.id);
        if (!stillExists && oldCol.isStatic) {
          throw new BadRequestException(
            `Không thể xoá column static: ${oldCol.name}`,
          );
        }
      }

      for (const newCol of newColumns) {
        if (!newCol.id) continue; // Skip newly added columns
        const oldCol = oldColumns.find((col) => col.id === newCol.id);
        if (!oldCol) continue;
        if (oldCol.isStatic) {
          if (newCol.name !== oldCol.name || newCol.type !== oldCol.type) {
            throw new BadRequestException(
              `Không thể sửa column static: ${oldCol.name}`,
            );
          }
        } else {
          if (newCol.name !== oldCol.name) {
            await queryRunner.query(
              `ALTER TABLE \`${exists.name}\` RENAME COLUMN \`${oldCol.name}\` TO \`${newCol.name}\`;`,
            );
          }
        }
      }

      // Detect deleted relations
      for (const oldRel of oldRelations) {
        const stillExists = newRelations.find((rel) => rel.id === oldRel.id);
        if (!stillExists && oldRel.isStatic) {
          throw new BadRequestException(
            `Không thể xoá relation static: ${oldRel.propertyName}`,
          );
        }
      }

      // Detect updated relations
      for (const newRel of newRelations) {
        if (!newRel.id) continue; // Skip new relations
        const oldRel = oldRelations.find((rel) => rel.id === newRel.id);
        if (!oldRel) continue;
        if (oldRel.isStatic) {
          if (
            newRel.propertyName !== oldRel.propertyName ||
            newRel.type !== oldRel.type
          ) {
            throw new BadRequestException(
              `Không thể sửa relation static: ${oldRel.propertyName}`,
            );
          }
        }
      }

      // Save updated entity with new + updated columns/relations
      const tableEntity = manager.create(Table_definition, {
        id: body.id,
        ...body,
        columns: this.normalizeColumnsWithAutoId(body.columns),
        relations: this.prepareRelations(body.relations),
      });

      const result = await manager.save(Table_definition, tableEntity);
      await queryRunner.commitTransaction();
      await this.autoService.pullMetadataFromDb();

      return result;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error(error.stack || error.message || error);
      throw new BadRequestException(error.message || 'Unknown error');
    } finally {
      await queryRunner.release();
    }
  }

  prepareRelations(relationsDto: CreateRelationDto[] = []) {
    const result = relationsDto.map((relation) => ({
      ...relation,
      targetTable: { id: relation.targetTable },
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

  async find(query: TQuery) {
    try {
      return await this.queryService.query({
        query,
        repository: this.tableDefRepo,
      });
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  async findOne(id: number, query: TQuery) {
    try {
      return await this.queryService.query({
        query,
        repository: this.tableDefRepo,
        id,
      });
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  async delete(id: number) {
    try {
      const exists = await this.tableDefRepo.findOne({
        where: { id },
      });

      if (!exists) {
        throw new BadRequestException(`Table với id ${id} không tồn tại.`);
      }

      if (exists.isStatic) {
        throw new BadRequestException(
          `Không thể xoá bảng static (${exists.name}).`,
        );
      }

      const result = await this.tableDefRepo.remove(exists);

      await this.autoService.pullMetadataFromDb();
      return result;
    } catch (error) {
      console.error(error.stack || error.message || error);
      throw new BadRequestException(error.message || 'Unknown error');
    }
  }
}
