import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DataSourceService } from '../data-source/data-source.service';
import { TableHanlderService } from '../table/table.service';
import { Table_definition } from '../entities/table_definition.entity';
import { AutoService } from '../auto/auto-entity.service';
import { CreateTableDto } from '../table/dto/create-table.dto';
import { Repository } from 'typeorm';
import { CommonService } from '../common/common.service';
import { Role_definition } from '../entities/role_definition.entity';
import { Setting_definition } from '../entities/setting_definition.entity';
import { User_definition } from '../entities/user_definition.entity';
import { InjectRepository } from '@nestjs/typeorm';
import * as path from 'path';
import { Column_definition } from '../entities/column_definition.entity';
import { Relation_definition } from '../entities/relation_definition.entity';
const initJson = require('./init.json');

@Injectable()
export class BootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BootstrapService.name);

  constructor(
    private dataSourceService: DataSourceService,
    private tableHandlerService: TableHanlderService,
    private autoService: AutoService,
    private commonService: CommonService,
    @InjectRepository(Table_definition)
    private tableDefRepo: Repository<Table_definition>,
  ) {}

  private async waitForDatabaseConnection(
    maxRetries = 10,
    delayMs = 1000,
  ): Promise<void> {
    const dataSource = this.dataSourceService.getDataSource();

    for (let i = 0; i < maxRetries; i++) {
      try {
        await dataSource.query('SELECT 1');
        this.logger.log('Kết nối tới DB thành công.');
        return;
      } catch (error) {
        this.logger.warn(`Chưa kết nối được DB, thử lại sau ${delayMs}ms...`);
        await this.commonService.delay(delayMs);
      }
    }

    throw new Error(`Không thể kết nối tới DB sau ${maxRetries} lần thử.`);
  }

  async onApplicationBootstrap() {
    await this.waitForDatabaseConnection();

    await this.createInitMetadata();
    await this.commonService.delay(300);

    await this.autoService.pullMetadataFromDb();
    await this.commonService.delay(300);

    await Promise.all([
      this.createDefaultRole(),
      this.insertDefaultSettingIfEmpty(),
      this.insertDefaultUserIfEmpty(),
    ]);
  }

  private async insertDefaultSettingIfEmpty(): Promise<void> {
    const tableName =
      this.dataSourceService.getTableNameFromEntity(Setting_definition);
    const dataSource = this.dataSourceService.getDataSource();

    const [{ count }] = await dataSource.query(
      `SELECT COUNT(*) as count FROM \`${tableName}\``,
    );

    if (Number(count) === 0) {
      this.logger.log(
        `Bảng '${tableName}' chưa có dữ liệu, tiến hành tạo mặc định.`,
      );

      const repo = this.dataSourceService.getRepository(tableName);
      const setting = repo.create(initJson.defaultSetting);
      await repo.save(setting);

      this.logger.log(`Tạo setting mặc định thành công.`);
    } else {
      this.logger.debug(`Bảng '${tableName}' đã có dữ liệu.`);
    }
  }

  private async createDefaultRole(): Promise<void> {
    const tableName =
      this.dataSourceService.getTableNameFromEntity(Role_definition);
    const dataSource = this.dataSourceService.getDataSource();

    const [result] = await dataSource.query(
      `SELECT COUNT(*) as count FROM \`${tableName}\` WHERE name = ?`,
      [initJson.defaultRole.name],
    );

    const existsInDb = result.count > 0;

    if (!existsInDb) {
      this.logger.log(`Tạo vai trò mặc định: ${initJson.defaultRole.name}`);
      const repo = this.dataSourceService.getRepository(tableName);
      const role = repo.create(initJson.defaultRole);
      await repo.save(role);
      this.logger.log(`Vai trò mặc định đã được tạo.`);
    } else {
      this.logger.debug(
        `Vai trò mặc định '${initJson.defaultRole.name}' đã tồn tại.`,
      );
    }
  }

  private async insertDefaultUserIfEmpty(): Promise<void> {
    const tableName =
      this.dataSourceService.getTableNameFromEntity(User_definition);
    const dataSource = this.dataSourceService.getDataSource();
    const userRepo = this.dataSourceService.getRepository(tableName);

    const [{ count }] = await dataSource.query(
      `SELECT COUNT(*) as count FROM \`${tableName}\``,
    );

    if (Number(count) === 0) {
      this.logger.log(`Tạo user mặc định: ${initJson.defaultUser.email}`);

      const user = userRepo.create(initJson.defaultUser);

      await userRepo.save(user);
      this.logger.log(`User mặc định đã được tạo.`);
    } else {
      this.logger.debug(
        `User mặc định '${initJson.defaultUser.email}' đã tồn tại.`,
      );
    }
  }

  async saveToDb(payload: CreateTableDto, repo: Repository<any>) {
    const newPayload = {
      ...payload,
      relations: this.tableHandlerService.prepareRelations(payload.relations),
    };
    try {
      return await repo.save(newPayload);
    } catch (error) {}
  }

  async createInitMetadata() {
    const snapshot = await import(path.resolve('snapshot.json'));
    const dataSource = this.dataSourceService.getDataSource();
    const queryRunner = dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const tableNameToId: Record<string, number> = {};

      // Phase 1: Insert bảng trắng với metadata
      for (const [name, defRaw] of Object.entries(snapshot)) {
        const def = defRaw as any;

        const exist = await queryRunner.manager.findOne(
          this.tableDefRepo.target,
          { where: { name: def.name } },
        );

        if (exist) {
          tableNameToId[name] = exist.id;
          this.logger.log(`⏩ Bỏ qua ${name}, đã tồn tại`);
        } else {
          const { columns, relations, ...rest } = def;
          const created = await queryRunner.manager.save(
            this.tableDefRepo.target,
            {
              ...rest,
              isStatic: true,
            },
          );
          tableNameToId[name] = created.id;
          this.logger.log(`✅ Tạo bảng trắng: ${name}`);
        }
      }

      // Phase 2: Chỉ thêm các column chưa có
      for (const [name, defRaw] of Object.entries(snapshot)) {
        const def = defRaw as any;
        const tableId = tableNameToId[name];
        if (!tableId) continue;

        // Lấy danh sách column hiện có bằng queryBuilder để chắc chắn có table.id
        const existingColumns = await queryRunner.manager
          .getRepository(Column_definition)
          .createQueryBuilder('c')
          .leftJoin('c.table', 't')
          .where('t.id = :tableId', { tableId })
          .select(['c.name AS name'])
          .getRawMany();

        const existingNames = new Set(existingColumns.map((col) => col.name));

        const newColumns = (def.columns || []).filter(
          (col: any) => col.name && !existingNames.has(col.name),
        );

        if (newColumns.length) {
          const toInsert = newColumns.map((col: any) => ({
            ...col,
            table: { id: tableId },
            isStatic: true,
          }));
          await queryRunner.manager.save(Column_definition, toInsert);
          this.logger.log(
            `📌 Thêm ${newColumns.length} column mới cho ${name}`,
          );
        } else {
          this.logger.log(`⏩ Không cần thêm column nào cho ${name}`);
        }
      }

      // Phase 3: Chỉ thêm các relation chưa có
      for (const [name, defRaw] of Object.entries(snapshot)) {
        const def = defRaw as any;
        const tableId = tableNameToId[name];
        if (!tableId) continue;

        // 1. Lấy các relation hiện có (dùng query builder để chắc chắn có id)
        const existingRelations = await queryRunner.manager
          .getRepository(Relation_definition)
          .createQueryBuilder('r')
          .leftJoin('r.sourceTable', 'source')
          .leftJoin('r.targetTable', 'target')
          .select([
            'r.propertyName AS propertyName',
            'source.id AS sourceId',
            'target.id AS targetId',
            'r.type AS relationType',
          ])
          .where('source.id = :tableId', { tableId })
          .getRawMany();

        const existingKeys = new Set(
          existingRelations.map((r) =>
            JSON.stringify({
              sourceTable: r.sourceId,
              targetTable: r.targetId,
              propertyName: r.propertyName,
              relationType: r.relationType,
            }),
          ),
        );

        const newRelations: any[] = [];

        for (const rel of def.relations || []) {
          if (!rel.propertyName || !rel.targetTable || !rel.type) {
            this.logger.warn(
              `⚠️ Relation thiếu propertyName, type hoặc targetTable trong ${name}`,
            );
            continue;
          }

          const targetId = tableNameToId[rel.targetTable];
          if (!targetId) {
            this.logger.warn(
              `⚠️ Không resolve được targetTable: ${rel.targetTable} trong relation của ${name}`,
            );
            continue;
          }

          const key = JSON.stringify({
            sourceTable: tableId,
            targetTable: targetId,
            propertyName: rel.propertyName,
            relationType: rel.type,
          });

          if (existingKeys.has(key)) {
            this.logger.warn(
              `⛔ Bỏ qua relation trùng: ${rel.propertyName} -> ${rel.targetTable}`,
            );
            continue;
          }

          newRelations.push({
            ...rel,
            sourceTable: { id: tableId },
            targetTable: { id: targetId },
            isStatic: true,
          });
        }

        if (newRelations.length) {
          await queryRunner.manager.save(Relation_definition, newRelations);
          this.logger.log(
            `📌 Thêm ${newRelations.length} relation mới cho ${name}`,
          );
        } else {
          this.logger.log(`⏩ Không cần thêm relation nào cho ${name}`);
        }
      }

      await queryRunner.commitTransaction();
      this.logger.log('🎉 createInitMetadata hoàn tất!');
    } catch (err) {
      await queryRunner.rollbackTransaction();
      this.logger.error('💥 Lỗi khi chạy createInitMetadata:', err);
      throw err;
    } finally {
      await queryRunner.release();
    }
  }
}
