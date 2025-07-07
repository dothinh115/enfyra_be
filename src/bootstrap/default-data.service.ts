import { Injectable, Logger } from '@nestjs/common';
import { DataSourceService } from '../data-source/data-source.service';
import { BcryptService } from '../auth/bcrypt.service';
const initJson = require('../bootstrap/init.json');

@Injectable()
export class DefaultDataService {
  private readonly logger = new Logger(DefaultDataService.name);

  constructor(
    private readonly dataSourceService: DataSourceService,
    private readonly bcryptService: BcryptService,
  ) {}

  async insertDefaultSettingIfEmpty(): Promise<void> {
    const settingDefRepo =
      this.dataSourceService.getRepository('setting_definition');
    const count = await settingDefRepo.count();

    if (count === 0) {
      this.logger.log(
        `Bảng 'setting_definition' chưa có dữ liệu, tiến hành tạo mặc định.`,
      );
      const setting = settingDefRepo.create(initJson.defaultSetting);
      await settingDefRepo.save(setting);
      this.logger.log(`Tạo setting mặc định thành công.`);
    } else {
      this.logger.debug(`Bảng 'setting_definition' đã có dữ liệu.`);
    }
  }

  async createDefaultRole(): Promise<void> {
    const roleDefRepo = this.dataSourceService.getRepository('role_definition');

    const exists = await roleDefRepo.findOne({
      where: { name: initJson.defaultRole.name },
    });

    if (!exists) {
      this.logger.log(`Tạo vai trò mặc định: ${initJson.defaultRole.name}`);
      const role = roleDefRepo.create(initJson.defaultRole);
      await roleDefRepo.save(role);
      this.logger.log(`Vai trò mặc định đã được tạo.`);
    } else {
      this.logger.debug(
        `Vai trò mặc định '${initJson.defaultRole.name}' đã tồn tại.`,
      );
    }
  }

  async insertDefaultUserIfEmpty(): Promise<void> {
    const userDefRepo = this.dataSourceService.getRepository('user_definition');

    const count = await userDefRepo.count();

    if (count === 0) {
      this.logger.log(`Tạo user mặc định: ${initJson.defaultUser.email}`);

      const user = userDefRepo.create({
        ...initJson.defaultUser,
        password: await this.bcryptService.hash(initJson.defaultUser.password),
      });

      await userDefRepo.save(user);
      this.logger.log(`User mặc định đã được tạo.`);
    } else {
      this.logger.debug(
        `User mặc định '${initJson.defaultUser.email}' đã tồn tại.`,
      );
    }
  }

  async createDefaultRoutes(): Promise<void> {
    const routeDefRepo =
      this.dataSourceService.getRepository('route_definition');
    const tableDefRepo =
      this.dataSourceService.getRepository('table_definition');

    for (const route of initJson.defaultRoute || []) {
      const { path, mainTable, isEnabled = true } = route;

      const existed = await routeDefRepo.findOne({ where: { path } });
      if (existed) {
        this.logger.log(`⏩ Route ${path} đã tồn tại, bỏ qua.`);
        continue;
      }

      const table = await tableDefRepo.findOne({
        where: { name: mainTable },
      });
      if (!table) {
        this.logger.warn(
          `⚠️ Không tìm thấy bảng '${mainTable}' cho route ${path}, bỏ qua.`,
        );
        continue;
      }

      const newRoute = routeDefRepo.create({
        ...route,
        mainTable: table,
      });

      await routeDefRepo.save(newRoute);
      this.logger.log(`✅ Tạo route mặc định: ${path} → ${mainTable}`);
    }
  }

  async insertDefaultHook(): Promise<void> {
    const hookDefRepo = this.dataSourceService.getRepository('hook_definition');

    const count = await hookDefRepo.count();

    if (count === 0) {
      this.logger.log(
        `Bảng 'hook_definition' chưa có dữ liệu, tiến hành tạo mặc định.`,
      );

      const hooks = hookDefRepo.create(initJson.defaultHook);
      await hookDefRepo.save(hooks);

      this.logger.log(`✅ Tạo hook mặc định thành công.`);
    } else {
      this.logger.debug(`Bảng 'hook_definition' đã có dữ liệu.`);
    }
  }

  async insertDefaultPermissionMap(): Promise<void> {
    const permissionRepo = this.dataSourceService.getRepository(
      'route_permission_map',
    );
    const settingRepo =
      this.dataSourceService.getRepository('setting_definition');

    const setting: any = await settingRepo.findOne({
      where: {},
    });
    if (!setting) {
      this.logger.warn(
        `⚠️ Không tìm thấy bản ghi nào trong 'setting_definition'. Không thể tạo route_permission_mapping.`,
      );
      return;
    }

    const defaultPermissions = initJson.defaultPermissionMap || [];

    for (const perm of defaultPermissions) {
      const exists = await permissionRepo.findOne({
        where: {
          method: perm.method,
          action: perm.action,
          setting: { id: setting.id },
        },
        relations: ['setting'],
      });

      if (exists) {
        this.logger.debug(
          `⏩ Permission [${perm.method} - ${perm.action}] đã tồn tại.`,
        );
        continue;
      }

      const newPerm = permissionRepo.create({
        method: perm.method,
        action: perm.action,
        setting: setting,
        isSystem: true,
      });

      await permissionRepo.save(newPerm);
      this.logger.log(
        `✅ Tạo permission [${perm.method} - ${perm.action}] thành công.`,
      );
    }
  }
}
