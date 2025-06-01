import * as path from 'path';
import { AutoService } from '../auto-generate/auto.service';
import { TableDefinition } from '../entities/table.entity';
import {
  CreateRelationDto,
  CreateTableDto,
} from '../table/dto/create-table.dto';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DataSourceService } from '../data-source/data-source.service';
import { QueryRunner } from 'typeorm';

@Injectable()
export class TableHanlderService {
  private logger = new Logger(TableHanlderService.name);
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
        columns: body.columns,
        relations: body.relations ? this.prepareRelations(body.relations) : [],
      } as any);

      await this.autoService.entityAutoGenerate(body);
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
    const queryRunner = this.dataSouceService
      .getDataSource()
      .createQueryRunner();
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

      const oldName = exists.name;
      const newName = body.name;
      if (oldName !== newName) {
        this.logger.log(`Sửa tên bảng, tiến hành cập nhật tên bảng trước!`);
        await queryRunner.query(
          `RENAME TABLE \`${oldName}\` TO \`${newName}\``,
        );

        this.logger.debug(`Đã sửa tên bảng ${oldName} thành ${newName}`);
        const oldFileTsPath = path.resolve(
          __dirname,
          '..',
          '..',
          'src',
          'dynamic-entities',
          `${oldName}.entity.ts`,
        );
        const oldFileJsPath = path.resolve(
          __dirname,
          '..',
          'dynamic-entities',
          `${oldName}.entity.js`,
        );
        this.logger.log(
          `Chuẩn bị xoá file entity với tên cũ: ${oldFileTsPath} và ${oldFileJsPath}`,
        );
        await this.autoService.autoRemoveOldFile([
          oldFileTsPath,
          oldFileJsPath,
        ]);
        this.logger.debug(`Xoá file entity cũ thành công!`);
      }
      await this.dataSouceService.reloadDataSource();
      repo = this.dataSouceService.getRepository(TableDefinition);

      // Tạo entity từ dữ liệu đã được xử lý
      const tableEntity = repo.create({
        id: body.id,
        ...body,
        relations: body.relations ? this.prepareRelations(body.relations) : [],
      });

      await this.autoService.entityAutoGenerate(body);
      await this.autoService.autoBuildToJs();
      await this.autoService.autoGenerateMigrationFile();
      await this.autoService.autoRunMigration();
      const result = await repo.save(tableEntity);
      await this.autoService.reGenerateEntitiesAfterUpdate(body.id);
      return result;
    } catch (error) {
      throw new BadRequestException(error);
    }
  }

  prepareRelations(relationsDto: CreateRelationDto[] = []) {
    return relationsDto.map((relation) => ({
      ...relation,
      targetTable: { id: relation.targetTable },
    }));
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
}
