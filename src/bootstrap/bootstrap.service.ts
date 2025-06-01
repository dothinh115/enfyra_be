import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DataSourceService } from '../data-source/data-source.service';
import { TableHanlderService } from '../table/table.service';
import { TableDefinition } from '../entities/table.entity';
import { AutoService } from '../auto/auto.service';
import { CreateTableDto } from '../table/dto/create-table.dto';
import { Repository } from 'typeorm';

const initJson = require('./init.json');

@Injectable()
export class BootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BootstrapService.name);

  constructor(
    private dataSourceService: DataSourceService,
    private tableHandlerService: TableHanlderService,
    private autoService: AutoService,
  ) {}

  async pullMetadataFromDb() {
    const tableRepo = this.dataSourceService.getRepository(TableDefinition);
    const tables: any[] = await tableRepo.find();
    for (const table of tables) {
      console.log(table);
      await this.autoService.entityAutoGenerate(table);
    }
  }

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
    await this.waitForDatabaseConnection();
    await this.pullMetadataFromDb();
    await this.createSettingTableIfNotExists();
    await this.createDefaultRoleTable();
    await this.createDefaultUserTableIfNotExists();
    await this.createDefaultRouteTableIfNotExists();
    await this.autoService.autoBuildToJs();
    await this.autoService.autoGenerateMigrationFile();
    await this.autoService.autoRunMigration();
    await this.dataSourceService.reloadDataSource();
    await Promise.all([
      await this.createDefaultRole(),
      await this.insertDefaultSettingIfEmpty(),
      await this.insertDefaultUserIfEmpty(),
      await this.insertDefaultRoutes(),
    ]);
  }

  private async checkTableExists(tableName: string): Promise<boolean> {
    const dataSource = this.dataSourceService.getDataSource();
    const query = `
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1
    `;
    const result = await dataSource.query(query, [tableName]);
    return result.length > 0;
  }

  private async createSettingTableIfNotExists(): Promise<void> {
    const tableName = initJson.settingTable.name;
    const hasTable = await this.checkTableExists(tableName);

    if (!hasTable) {
      this.logger.log(`Bảng '${tableName}' chưa tồn tại, tiến hành tạo.`);
      await this.autoService.entityAutoGenerate(initJson.settingTable);
      const tableRepo = this.dataSourceService.getRepository(TableDefinition);
      await this.saveToDb(initJson.settingTable, tableRepo);
      this.logger.log(`Tạo bảng '${tableName}' thành công.`);
    } else {
      this.logger.debug(`Bảng '${tableName}' đã tồn tại.`);
    }
  }

  private async createDefaultRoleTable(): Promise<void> {
    const tableName = initJson.defaultRoleTable.name;
    const hasTable = await this.checkTableExists(tableName);

    if (!hasTable) {
      this.logger.log(`Tạo bảng: ${tableName}`);
      await this.autoService.entityAutoGenerate(initJson.defaultRoleTable);
      const tableRepo = this.dataSourceService.getRepository(TableDefinition);
      await this.saveToDb(initJson.defaultRoleTable, tableRepo);
      this.logger.log(`Tạo bảng '${tableName}' thành công.`);
    } else {
      this.logger.debug(`Bảng '${tableName}' đã tồn tại.`);
    }
  }

  private async createDefaultUserTableIfNotExists(): Promise<void> {
    const tableName = initJson.defaultUserTable.name;
    const hasTable = await this.checkTableExists(tableName);

    if (!hasTable) {
      this.logger.log(`Bảng '${tableName}' chưa tồn tại, tiến hành tạo.`);
      await this.autoService.entityAutoGenerate(initJson.defaultUserTable);
      const tableRepo = this.dataSourceService.getRepository(TableDefinition);
      await this.saveToDb(initJson.defaultUserTable, tableRepo);
      this.logger.log(`Tạo bảng '${tableName}' thành công.`);
    } else {
      this.logger.debug(`Bảng '${tableName}' đã tồn tại.`);
    }
  }

  private async createDefaultRouteTableIfNotExists(): Promise<void> {
    const tableName = initJson.defaultRouteTable.name;
    const hasTable = await this.checkTableExists(tableName);

    if (!hasTable) {
      this.logger.log(`Bảng '${tableName}' chưa tồn tại, tiến hành tạo.`);
      await this.autoService.entityAutoGenerate(initJson.defaultRouteTable, {
        name: 'table',
        type: 'many-to-one',
      });
      const tableRepo = this.dataSourceService.getRepository(TableDefinition);
      await this.saveToDb(initJson.defaultRouteTable, tableRepo);
      this.logger.log(`Tạo bảng '${tableName}' thành công.`);
    } else {
      this.logger.debug(`Bảng '${tableName}' đã tồn tại.`);
    }
  }

  private async insertDefaultSettingIfEmpty(): Promise<void> {
    const tableName = initJson.settingTable.name;
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
    const tableName = initJson.defaultRoleTable.name;
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
    const tableName = initJson.defaultUserTable.name;
    const dataSource = this.dataSourceService.getDataSource();
    const userRepo = this.dataSourceService.getRepository(tableName);

    const [{ count }] = await dataSource.query(
      `SELECT COUNT(*) as count FROM \`${tableName}\``,
    );

    if (Number(count) === 0) {
      this.logger.log(`Tạo user mặc định: ${initJson.defaultUser.email}`);

      const roleRepo = this.dataSourceService.getRepository(
        initJson.defaultRoleTable.name,
      );
      const role = await roleRepo.findOneBy({
        name: initJson.defaultRole.name,
      });

      if (!role) {
        throw new Error(
          `Vai trò mặc định '${initJson.defaultRole.name}' không tồn tại.`,
        );
      }

      const user = userRepo.create({
        ...initJson.defaultUser,
        role,
      });

      await userRepo.save(user);
      this.logger.log(`User mặc định đã được tạo.`);
    } else {
      this.logger.debug(
        `User mặc định '${initJson.defaultUser.email}' đã tồn tại.`,
      );
    }
  }

  private async insertDefaultRoutes(): Promise<void> {
    const tableName = initJson.defaultRouteTable.name;
    const routeRepo = this.dataSourceService.getRepository(tableName);
    const existingRoutes = await routeRepo.find();

    const paths = [
      initJson.defaultUserTable.name,
      initJson.defaultRoleTable.name,
      initJson.settingTable.name,
      initJson.defaultRouteTable.name,
    ];

    let insertedCount = 0;
    for (const path of paths) {
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
}
