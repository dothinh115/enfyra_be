import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DataSourceService } from '../data-source/data-source.service';
import { TableHanlderService } from '../table/table.service';
import { Table_definition } from '../entities/table_definition.entity';
import { AutoService } from '../auto/auto.service';
import { CreateTableDto } from '../table/dto/create-table.dto';
import { Repository } from 'typeorm';
import { CommonService } from '../common/common.service';
import { Middleware_definition } from '../entities/middleware_definition.entity';
import { Route_definition } from '../entities/route_definition.entity';
import { Role_definition } from '../entities/role_definition.entity';
import { Setting_definition } from '../entities/setting_definition.entity';
import { User_definition } from '../entities/user_definition.entity';
import { InjectRepository } from '@nestjs/typeorm';
import * as path from 'path';
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

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

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
        await this.delay(delayMs);
      }
    }

    throw new Error(`Không thể kết nối tới DB sau ${maxRetries} lần thử.`);
  }

  async onApplicationBootstrap() {
    // return;
    await this.waitForDatabaseConnection();
    await this.createInitMetadata();

    await this.autoService.pullMetadataFromDb();
    this.delay(2000);
    await Promise.all([
      await this.createDefaultRole(),
      await this.insertDefaultSettingIfEmpty(),
      await this.insertDefaultUserIfEmpty(),
      await this.insertDefaultRoutes(),
    ]);
    await this.createAdminRoute();
  }

  private async insertDefaultSettingIfEmpty(): Promise<void> {
    const tableName =
      this.commonService.getTableNameFromEntity(Setting_definition);
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
      this.commonService.getTableNameFromEntity(Role_definition);
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
      this.commonService.getTableNameFromEntity(User_definition);
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

  private async insertDefaultRoutes(): Promise<void> {
    const routeRepo = this.dataSourceService.getRepository(Route_definition);
    const tableDefRepo = this.dataSourceService.getRepository(Table_definition);

    const existingRoutes = await routeRepo.find();

    const paths = [
      this.commonService.getTableNameFromEntity(User_definition),
      this.commonService.getTableNameFromEntity(Role_definition),
      this.commonService.getTableNameFromEntity(Setting_definition),
    ];

    let insertedCount = 0;

    for (const path of paths) {
      // 🔍 Tìm id trong TableDefinition theo name
      const targetTable: any = await tableDefRepo.findOne({
        where: { name: path },
      });

      if (!targetTable) {
        this.logger.warn(
          `❗Không tìm thấy TableDefinition cho '${path}', bỏ qua.`,
        );
        continue;
      }

      for (const method of Object.keys(initJson.routeDefinition)) {
        const def = initJson.routeDefinition[method];

        const alreadyExists = existingRoutes.some(
          (r: any) => r.method === def.method && r.path === `/${path}`,
        );

        if (!alreadyExists) {
          const route = routeRepo.create({
            method: def.method,
            path: `/${path}`,
            handler: def.handler,
            targetTable: targetTable.id, // 👈 Gán ID vào đây
          });

          await routeRepo.save(route);
          insertedCount++;
        }
      }
    }

    if (insertedCount) {
      this.logger.log(`✅ Đã tạo ${insertedCount} route mặc định.`);
    } else {
      this.logger.debug(`Tất cả route mặc định đã tồn tại.`);
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

  async createAdminRoute() {
    const repo = this.dataSourceService.getRepository(Middleware_definition);
    const count = await repo.count();
    if (count === 0) {
      await repo.create(initJson.adminGuardMiddleware);
    }
  }

  async createInitMetadata() {
    const payload = await import(path.resolve('snapshot.json'));
    const dataSource = this.dataSourceService.getDataSource();
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    // Hàm helper resolve tên bảng/id thành { id: number }
    const resolveTableReference = async (
      ref: any,
    ): Promise<{ id: number } | null> => {
      this.logger.log(`Tìm tên bảng ${ref}`);
      if (!ref) return null;

      if (typeof ref === 'string') {
        // Nếu là tên bảng, query DB lấy id
        const tableEntity = await this.tableDefRepo.findOne({
          where: { name: ref },
        });
        if (!tableEntity) {
          this.logger.warn(`Không tìm thấy bảng có tên '${ref}' để lấy id`);
          return null;
        }
        return { id: tableEntity.id };
      }

      if (typeof ref === 'number') {
        // Nếu là id luôn, trả về object
        return { id: ref };
      }

      if (typeof ref === 'object' && ref.id) {
        // Nếu đã là object id rồi, giữ nguyên
        return { id: ref.id };
      }

      return null;
    };

    try {
      // Lấy tất cả tên bảng trong payload
      const allTableNames = Object.keys(payload);

      // Build dependency map: tableName -> mảng bảng phụ thuộc
      const dependencyMap: Record<string, string[]> = {};

      for (const tableName of allTableNames) {
        const tableData = payload[tableName];
        const targetTables = (tableData.relations || [])
          .map((rel: any) => rel.targetTable)
          .filter(Boolean)
          .map((t: any) => {
            if (typeof t === 'number') {
              const found = allTableNames.find(
                (name) => payload[name].id === t,
              );
              return found || null;
            }
            return t;
          })
          .filter(Boolean);

        dependencyMap[tableName] = targetTables;
      }

      // Hàm topological sort để sắp xếp theo phụ thuộc
      function topoSort(
        nodes: string[],
        edges: Record<string, string[]>,
      ): string[] {
        const sorted: string[] = [];
        const visited = new Set<string>();
        const visiting = new Set<string>();

        function visit(node: string) {
          if (visited.has(node)) return;
          if (visiting.has(node)) throw new Error(`Cycle detected at ${node}`);
          visiting.add(node);
          (edges[node] || []).forEach(visit);
          visiting.delete(node);
          visited.add(node);
          sorted.push(node);
        }

        nodes.forEach((node) => {
          if (!visited.has(node)) visit(node);
        });

        return sorted;
      }

      const sortedTables = topoSort(allTableNames, dependencyMap);

      // Hàm save từng bảng
      const saveTable = async (key: string) => {
        const tableData = payload[key];
        const exist = await this.tableDefRepo.findOne({
          where: { name: tableData.name },
        });
        if (exist) {
          this.logger.log(`Bỏ qua ${key}, đã tồn tại trong DB`);
          return;
        }

        this.logger.log(`Tạo bảng ${tableData.name} trắng để lấy id...`);
        const emptyTable = await this.tableDefRepo.save({
          name: tableData.name,
          isStatic: true,
        });
        this.logger.debug(`Tạo bảng ${tableData.name} trắng thành công!`);

        // Xử lý columns, resolve table field
        const columns = await Promise.all(
          (tableData.columns || []).map(async (col: any) => {
            const resolvedTable = (await resolveTableReference(col.table)) || {
              id: emptyTable.id,
            };
            return { ...col, table: resolvedTable };
          }),
        );

        // Xử lý relations, resolve targetTable field
        const relations = await Promise.all(
          (tableData.relations || []).map(async (rel: any) => {
            const resolvedSourceTable = (
              await resolveTableReference(tableData.name)
            ).id;
            const resolvedTargetTable = (
              await resolveTableReference(rel.targetTable)
            ).id;

            return {
              ...rel,
              sourceTable: resolvedSourceTable,
              targetTable: resolvedTargetTable,
            };
          }),
        );

        await this.tableDefRepo.save({
          ...tableData,
          id: emptyTable.id,
          columns,
          relations,
        });

        this.logger.debug(`Tạo metadata cho ${key} thành công!`);
      };

      for (const tableName of sortedTables) {
        await saveTable(tableName);
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Lỗi khi tạo metadata:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
