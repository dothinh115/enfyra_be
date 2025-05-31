import * as path from 'path';
import { AutoGenerateService } from '../auto-generate/auto-generate.service';
import { TableDefinition } from '../entities/table.entity';
import {
  CreateRelationDto,
  CreateTableDto,
} from '../table/dto/create-table.dto';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Table } from 'typeorm';

@Injectable()
export class TableHanlderService {
  private logger = new Logger(TableHanlderService.name);
  constructor(
    @InjectRepository(TableDefinition)
    private dataSouce: DataSource,
    private autoGService: AutoGenerateService,
  ) {}

  async createTable(body: CreateTableDto) {
    const queryRunner = this.dataSouce.createQueryRunner();
    await queryRunner.connect(); // Kết nối
    await queryRunner.startTransaction();
    const manager = queryRunner.manager;
    try {
      const hasTable = await queryRunner.hasTable(body.name);
      const tableData = await manager.findOne(TableDefinition, {
        where: {
          name: body.name,
        },
      });
      if (hasTable && tableData) {
        throw new BadRequestException(`Bảng ${body.name} đã tồn tại!`);
      }

      // Tạo entity từ dữ liệu đã được xử lý
      const tableEntity = manager.create(TableDefinition, {
        name: body.name,
        columns: body.columns,
        relations: body.relations ? this.prepareRelations(body.relations) : [],
      } as any);

      const result = !hasTable
        ? await this.autoGService.entityAutoGenerate(body)
        : null;

      if (!tableData) await manager.save(TableDefinition, tableEntity);

      await queryRunner.commitTransaction();
      return tableData ? tableData : result;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error(error.stack || error.message || error);
      throw new BadRequestException(error.message || 'Unknown error');
    } finally {
      await queryRunner.release();
    }
  }

  async updateTable(id: number, body: CreateTableDto) {
    const queryRunner = this.dataSouce.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    const manager = queryRunner.manager;
    try {
      const exists = await manager.findOne(TableDefinition, {
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
        const oldFilePath = path.resolve(
          __dirname,
          '..',
          '..',
          'src',
          'dynamic-entities',
          `${oldName}.entity.ts`,
        );
        this.logger.log(`Chuẩn bị xoá file entity với tên cũ: ${oldFilePath}`);
        await this.autoGService.autoRemoveOldFile(oldFilePath);
        this.logger.debug(`Xoá file entity cũ thành công!`);
      }

      // Tạo entity từ dữ liệu đã được xử lý
      const tableEntity = manager.create(TableDefinition, {
        ...body,
        relations: body.relations ? this.prepareRelations(body.relations) : [],
      });

      await this.autoGService.entityAutoGenerate(body);
      const result = await manager.save(TableDefinition, tableEntity);
      await queryRunner.commitTransaction();
      return result;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw new BadRequestException(error);
    } finally {
      await queryRunner.release();
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
      const repo = this.dataSouce.getRepository(TableDefinition);
      return await repo.find();
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }
}
