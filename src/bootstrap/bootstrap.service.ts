import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { QueryRunner } from 'typeorm';
import { DataSourceService } from '../data-source/data-source.service';
import { TableHanlderService } from '../table/table.service';
const initJson = require('./init.json');

@Injectable()
export class BootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BootstrapService.name);

  constructor(
    private readonly dataSourceService: DataSourceService,
    private readonly tableHandlerService: TableHanlderService,
  ) {}

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  resetQueryRunner(): QueryRunner {
    const dataSource = this.dataSourceService.getDataSource();
    return dataSource.createQueryRunner();
  }

  async onApplicationBootstrap() {
    await this.createSettingTable();
    await this.delay(2000);
    await this.createDefaultRoleTable();
    await this.delay(2000);
    await this.createDefaultRole();
    await this.delay(2000);
    await this.createDefaultUserTable();
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

  private async createSettingTable(): Promise<void> {
    const tableName = initJson.settingTable.name;
    const queryRunner = this.resetQueryRunner();

    try {
      const hasTable = await this.checkTableExists(tableName);

      if (!hasTable) {
        this.logger.log(`Bảng '${tableName}' chưa tồn tại, tiến hành tạo.`);
        await this.tableHandlerService.createTable(initJson.settingTable);
        this.logger.log(`Tạo bảng '${tableName}' thành công.`);
      } else {
        this.logger.debug(`Bảng '${tableName}' đã tồn tại.`);
      }

      // Kiểm tra số bản ghi trong bảng
      const [{ count }] = await queryRunner.query(
        `SELECT COUNT(*) as count FROM \`${tableName}\``,
      );

      if (count === 0) {
        this.logger.log(
          `Bảng '${tableName}' chưa có dữ liệu, tiến hành tạo mặc định.`,
        );

        // Dùng repository để tạo và lưu bản ghi mặc định (nếu entity ánh xạ đúng)
        const repo = this.dataSourceService.getRepository(tableName);
        const setting = repo.create(initJson.defaultSetting);
        await repo.save(setting);

        this.logger.log(`Tạo setting mặc định thành công.`);
      } else {
        this.logger.debug(`Bảng '${tableName}' đã có dữ liệu.`);
      }
    } catch (error) {
      this.logger.error(
        `Lỗi khi xử lý bảng setting '${tableName}': ${error.message}`,
      );
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async createDefaultRoleTable(): Promise<void> {
    const tableName = initJson.defaultRoleTable.name;
    const queryRunner = this.resetQueryRunner();

    try {
      const hasTable = await this.checkTableExists(tableName);

      if (!hasTable) {
        this.logger.log(`Tạo bảng: ${tableName}`);
        await this.tableHandlerService.createTable(initJson.defaultRoleTable);
        this.logger.log(`Tạo bảng '${tableName}' thành công.`);
      } else {
        this.logger.debug(`Bảng '${tableName}' đã tồn tại.`);
      }
    } catch (error) {
      this.logger.error(`Lỗi tạo bảng vai trò: ${error.message}`);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async createDefaultRole(): Promise<void> {
    const tableName = initJson.defaultRoleTable.name;
    const queryRunner = this.resetQueryRunner();

    try {
      const hasTable = await this.checkTableExists(tableName);
      if (!hasTable) {
        throw new Error(`Bảng '${tableName}' chưa tồn tại.`);
      }

      // Kiểm tra vai trò đã tồn tại chưa bằng truy vấn SQL thay vì repo.exists()
      const [result] = await queryRunner.query(
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
    } catch (error) {
      this.logger.error(`Lỗi tạo vai trò mặc định: ${error.message}`);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async createDefaultUserTable(): Promise<void> {
    const tableName = initJson.defaultUserTable.name;

    try {
      const hasTable = await this.checkTableExists(tableName);

      if (!hasTable) {
        this.logger.log(`Bảng '${tableName}' chưa tồn tại, tiến hành tạo.`);
        await this.tableHandlerService.createTable(initJson.defaultUserTable);
        this.logger.log(`Tạo bảng '${tableName}' thành công.`);
      } else {
        this.logger.debug(`Bảng '${tableName}' đã tồn tại.`);
      }

      const userRepo = this.dataSourceService.getRepository(tableName);
      const exists = await userRepo.exists({
        where: { email: initJson.defaultUser.email },
      });

      if (!exists) {
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
    } catch (error) {
      this.logger.error(
        `Lỗi tạo bảng user hoặc user mặc định: ${error.message}`,
      );
      throw error;
    }
  }
}
