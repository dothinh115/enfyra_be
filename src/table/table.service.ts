import { AutoGenerateService } from '../auto-generate/auto-generate.service';
import { TableDefinition } from '../entities/table.entity';
import { RabbitMQRegistry } from '../rabbitmq/rabbitmq.service';
import { CreateTableDto } from '../table/dto/create-table.dto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

@Injectable()
export class TableService {
  constructor(
    @InjectRepository(TableDefinition)
    private tableDefinitionRepo: Repository<TableDefinition>,
    private dataSouce: DataSource,
    private rmqClient: RabbitMQRegistry,
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

      //tiến hành tạo data để lưu db
      const relations = body.relations
        ? await Promise.all(
            body.relations.map(async (relation) => {
              const targetTable = await manager.findOne(TableDefinition, {
                where: {
                  name: relation.targetTable as string,
                },
              });

              if (!targetTable) {
                throw new BadRequestException(
                  `Relation targetTable ${relation.targetTable} không tồn tại!`,
                );
              }

              return {
                ...relation,
                targetTable, // Gán entity luôn nếu là quan hệ @ManyToOne
              };
            }),
          )
        : [];

      // Tạo entity từ dữ liệu đã được xử lý
      const tableEntity = manager.create(TableDefinition, {
        name: body.name,
        columns: body.columns,
        relations,
      });

      if (!tableData) await manager.save(TableDefinition, tableEntity);

      const result = !hasTable
        ? await this.autoGService.entityAutoGenerate(body)
        : null;
      await queryRunner.commitTransaction();
      return tableData ? tableData : result;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw new BadRequestException(error);
    } finally {
      await queryRunner.release();
    }
  }

  async updateTable(id: number, body: CreateTableDto) {
    const queryRunner = this.dataSouce.createQueryRunner();
    await queryRunner.connect(); // Kết nối
    await queryRunner.startTransaction();
    const client = this.rmqClient.getClient();

    try {
      const exists = await this.tableDefinitionRepo.findOne({
        where: {
          id,
        },
      });
      if (!exists) {
        throw new BadRequestException(`Table ${body.name} không tồn tại.`);
      }
      //tiến hành tạo data để lưu db
      const relations = body.relations
        ? await Promise.all(
            body.relations.map(async (relation) => {
              const targetTable = await this.tableDefinitionRepo.findOne({
                where: {
                  name: relation.targetTable as string,
                },
              });

              if (!targetTable) {
                throw new BadRequestException(
                  `Relation targetTable ${relation.targetTable} không tồn tại!`,
                );
              }

              return {
                ...relation,
                targetTable, // Gán entity luôn nếu là quan hệ @ManyToOne
              };
            }),
          )
        : [];

      // Tạo entity từ dữ liệu đã được xử lý
      const tableEntity = this.tableDefinitionRepo.create({
        id,
        name: body.name,
        columns: body.columns as any,
        relations,
      });

      const result = await this.tableDefinitionRepo.save(tableEntity);
      await queryRunner.commitTransaction();
      await this.autoGService.entityAutoGenerate(body);
      return result;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw new BadRequestException(error);
    } finally {
      await queryRunner.release();
    }
  }

  async find() {
    try {
      return await this.tableDefinitionRepo.find();
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }
}
