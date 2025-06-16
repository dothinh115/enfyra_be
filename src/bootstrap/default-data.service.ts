import { Injectable, Logger } from '@nestjs/common';
import { DataSourceService } from '../data-source/data-source.service';
import { Role_definition } from '../entities/role_definition.entity';
import { User_definition } from '../entities/user_definition.entity';
import { BcryptService } from '../auth/bcrypt.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Setting_definition } from '../entities/setting_definition.entity';
import { Table_definition } from '../entities/table_definition.entity';
import { Route_definition } from '../entities/route_definition.entity';
import { Repository } from 'typeorm';
const initJson = require('../bootstrap/init.json');

@Injectable()
export class DefaultDataService {
  private readonly logger = new Logger(DefaultDataService.name);

  constructor(
    private readonly dataSourceService: DataSourceService,
    private readonly bcryptService: BcryptService,
    @InjectRepository(Setting_definition)
    private settingDefRepo: Repository<Setting_definition>,
    @InjectRepository(Role_definition)
    private roleDefRepo: Repository<Role_definition>,
    @InjectRepository(User_definition)
    private userDefRepo: Repository<User_definition>,
    @InjectRepository(Table_definition)
    private tableDefRepo: Repository<Table_definition>,
    @InjectRepository(Route_definition)
    private routeDefRepo: Repository<Route_definition>,
  ) {}

  async insertDefaultSettingIfEmpty(): Promise<void> {
    const count = await this.settingDefRepo.count();

    if (count === 0) {
      this.logger.log(
        `Bảng 'setting_definition' chưa có dữ liệu, tiến hành tạo mặc định.`,
      );
      const setting = this.settingDefRepo.create(initJson.defaultSetting);
      await this.settingDefRepo.save(setting);
      this.logger.log(`Tạo setting mặc định thành công.`);
    } else {
      this.logger.debug(`Bảng 'setting_definition' đã có dữ liệu.`);
    }
  }

  async createDefaultRole(): Promise<void> {
    const exists = await this.roleDefRepo.findOne({
      where: { name: initJson.defaultRole.name },
    });

    if (!exists) {
      this.logger.log(`Tạo vai trò mặc định: ${initJson.defaultRole.name}`);
      const role = this.roleDefRepo.create(initJson.defaultRole);
      await this.roleDefRepo.save(role);
      this.logger.log(`Vai trò mặc định đã được tạo.`);
    } else {
      this.logger.debug(
        `Vai trò mặc định '${initJson.defaultRole.name}' đã tồn tại.`,
      );
    }
  }

  async insertDefaultUserIfEmpty(): Promise<void> {
    const count = await this.userDefRepo.count();

    if (count === 0) {
      this.logger.log(`Tạo user mặc định: ${initJson.defaultUser.email}`);

      const user = this.userDefRepo.create({
        ...initJson.defaultUser,
        password: await this.bcryptService.hash(initJson.defaultUser.password),
      });

      await this.userDefRepo.save(user);
      this.logger.log(`User mặc định đã được tạo.`);
    } else {
      this.logger.debug(
        `User mặc định '${initJson.defaultUser.email}' đã tồn tại.`,
      );
    }
  }

  async createDefaultRoutes(): Promise<void> {
    for (const route of initJson.defaultRoute || []) {
      const { path, mainTable, isEnabled = true } = route;

      const existed = await this.routeDefRepo.findOne({ where: { path } });
      if (existed) {
        this.logger.log(`⏩ Route ${path} đã tồn tại, bỏ qua.`);
        continue;
      }

      const table = await this.tableDefRepo.findOne({
        where: { name: mainTable },
      });
      if (!table) {
        this.logger.warn(
          `⚠️ Không tìm thấy bảng '${mainTable}' cho route ${path}, bỏ qua.`,
        );
        continue;
      }

      const newRoute = this.routeDefRepo.create({
        ...route,
        mainTable: table,
      });

      await this.routeDefRepo.save(newRoute);
      this.logger.log(`✅ Tạo route mặc định: ${path} → ${mainTable}`);
    }
  }
}
