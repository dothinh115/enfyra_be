import { CreateColumnDto, CreateTableDto } from '../table/dto/create-table.dto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSourceService } from '../data-source/data-source.service';
import { MetadataSyncService } from '../metadata/metadata-sync.service';

@Injectable()
export class TableHandlerService {
  constructor(
    private dataSourceService: DataSourceService,
    private metadataSyncService: MetadataSyncService,
  ) {}

  async createTable(body: CreateTableDto) {
    const dataSource = this.dataSourceService.getDataSource();
    const tableEntity =
      this.dataSourceService.entityClassMap.get('table_definition');

    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    const manager = queryRunner.manager;
    try {
      const hasTable = await queryRunner.hasTable(body.name);
      let result: any = await manager.findOne(tableEntity, {
        where: {
          name: body.name,
        },
      });
      if (hasTable && result) {
        throw new BadRequestException(`Bảng ${body.name} đã tồn tại!`);
      }

      // Tạo entity từ dữ liệu đã được xử lý
      const createTableEntity = manager.create(tableEntity, {
        columns: this.normalizeColumnsWithAutoId(body.columns),
        ...body,
      } as any);

      result = await manager.save(tableEntity, createTableEntity);
      await queryRunner.commitTransaction();
      await this.metadataSyncService.syncAll();
      const routeDefRepo =
        this.dataSourceService.getRepository('route_definition');
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
    const dataSource = this.dataSourceService.getDataSource();
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    const manager = queryRunner.manager;
    const tableEntity =
      this.dataSourceService.entityClassMap.get('table_definition');
    try {
      const exists = await manager.findOne(tableEntity, {
        where: { id },
        relations: ['columns', 'relations'],
      });

      if (!exists) {
        throw new BadRequestException(`Table ${body.name} không tồn tại.`);
      }
      const result = await manager.save(tableEntity, body as any);
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
      this.dataSourceService.getRepository('table_definition');
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
