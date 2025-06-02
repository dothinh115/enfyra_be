import { AutoService } from '../auto/auto.service';
import { TableDefinition } from '../entities/table.entity';
import {
  CreateColumnDto,
  CreateRelationDto,
  CreateTableDto,
} from '../table/dto/create-table.dto';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DataSourceService } from '../data-source/data-source.service';

@Injectable()
export class TableHanlderService {
  constructor(
    private dataSouceService: DataSourceService,
    private autoService: AutoService,
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
      let result = await manager.findOne(TableDefinition, {
        where: {
          name: body.name,
        },
      });
      if (hasTable && result) {
        throw new BadRequestException(`Bảng ${body.name} đã tồn tại!`);
      }

      // Tạo entity từ dữ liệu đã được xử lý
      const tableEntity = manager.create(TableDefinition, {
        name: body.name,
        columns: this.normalizeColumnsWithAutoId(body.columns),
        relations: body.relations ? this.prepareRelations(body.relations) : [],
      } as any);

      await this.autoService.entityAutoGenerate({
        ...body,
        columns: this.normalizeColumnsWithAutoId(body.columns),
      });
      await this.autoService.autoBuildToJs();
      await this.autoService.autoGenerateMigrationFile();
      await this.autoService.autoRunMigration();

      if (!result) result = await manager.save(TableDefinition, tableEntity);

      await queryRunner.commitTransaction();
      await this.dataSouceService.reloadDataSource();
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
    let repo =
      this.dataSouceService.getRepository<TableDefinition>(TableDefinition);
    try {
      const exists = await repo.findOne({
        where: {
          id,
        },
      });
      if (!exists) {
        throw new BadRequestException(`Table ${body.name} không tồn tại.`);
      }

      // Tạo entity từ dữ liệu đã được xử lý
      const tableEntity = repo.create({
        id: body.id,
        ...body,
        columns: this.normalizeColumnsWithAutoId(body.columns),
        relations: body.relations ? this.prepareRelations(body.relations) : [],
      });

      await this.autoService.entityAutoGenerate({
        ...body,
        name: exists.name,
        columns: this.normalizeColumnsWithAutoId(body.columns),
      });
      await this.autoService.autoBuildToJs();
      await this.autoService.autoGenerateMigrationFile();
      await this.autoService.autoRunMigration();
      const result = await repo.save(tableEntity);
      return result;
    } catch (error) {
      throw new BadRequestException(error);
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
    const idType = userIdCol?.type === 'varchar' ? 'uuid' : 'int';

    // Loại bỏ cột id do user định nghĩa
    const filtered = columns.filter((col) => col.name !== 'id');

    // Tạo cột id chuẩn
    const idColumn: CreateColumnDto =
      idType === 'uuid'
        ? {
            name: 'id',
            type: 'varchar',
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

  async find() {
    try {
      const repo = this.dataSouceService.getRepository(TableDefinition);
      return await repo.find();
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  async findOne(id: number) {
    try {
      const repo = this.dataSouceService.getRepository(TableDefinition);
      return await repo.findOne({
        where: { id },
      });
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  async delete(id: number) {}
}
