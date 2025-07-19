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

  async insertAllDefaultRecords(): Promise<void> {
    for (const [tableName, rawRecords] of Object.entries(initJson)) {
      const repo = this.dataSourceService.getRepository(tableName);
      const count = await repo.count();

      if (
        !rawRecords ||
        (Array.isArray(rawRecords) && rawRecords.length === 0)
      ) {
        this.logger.debug(
          `❎ Bảng '${tableName}' không có dữ liệu mặc định, bỏ qua.`,
        );
        continue;
      }

      if (count > 0) {
        this.logger.debug(`⏩ Bảng '${tableName}' đã có dữ liệu, bỏ qua.`);
        continue;
      }

      this.logger.log(`📥 Khởi tạo bảng '${tableName}'`);

      let records = Array.isArray(rawRecords) ? rawRecords : [rawRecords];

      // Plugin: xử lý đặc biệt nếu cần
      if (tableName === 'user_definition') {
        records = await Promise.all(
          records.map(async (r) => ({
            ...r,
            password: await this.bcryptService.hash(r.password),
          })),
        );
      }

      if (tableName === 'route_definition') {
        const tableDefRepo =
          this.dataSourceService.getRepository('table_definition');
        records = await Promise.all(
          records.map(async (r: any) => {
            const mainTable = await tableDefRepo.findOne({
              where: { name: r.mainTable },
            });
            if (!mainTable) {
              this.logger.warn(
                `⚠️ Không tìm thấy bảng '${r.mainTable}' cho route ${r.path}, bỏ qua.`,
              );
              return null;
            }
            return {
              ...r,
              mainTable,
            };
          }),
        );
        records = records.filter(Boolean); // bỏ undefined
      }

      if (tableName === 'method_definition') {
        const settingRepo =
          this.dataSourceService.getRepository('setting_definition');
        const setting = await settingRepo.findOne({ where: {} });
        if (!setting) {
          this.logger.warn(`⚠️ Không có setting để gán permission, bỏ qua.`);
          continue;
        }

        records = records.map((r: any) => ({
          ...r,
          setting,
          isSystem: true,
        }));
      }

      if (tableName === 'hook_definition') {
        const routeRepo =
          this.dataSourceService.getRepository('route_definition');
        const methodRepo =
          this.dataSourceService.getRepository('method_definition');

        records = await Promise.all(
          records.map(async (hook: any) => {
            const transformedHook = { ...hook };

            if (hook.route && typeof hook.route === 'string') {
              const rawPath = hook.route;
              const pathsToTry = Array.from(
                new Set([
                  rawPath,
                  rawPath.startsWith('/') ? rawPath.slice(1) : '/' + rawPath,
                ]),
              );

              const route = await routeRepo.findOne({
                where: pathsToTry.map((p) => ({ path: p })),
              });

              if (!route) {
                this.logger.warn(
                  `⚠️ Không tìm thấy route '${hook.route}' cho hook '${hook.name}', bỏ qua.`,
                );
                return null;
              }
              transformedHook.route = route;
            }

            if (hook.method && typeof hook.method === 'string') {
              const method = await methodRepo.findOne({
                where: { method: hook.method },
              });
              if (!method) {
                this.logger.warn(
                  `⚠️ Không tìm thấy method '${hook.method}' cho hook '${hook.name}', bỏ qua.`,
                );
                return null;
              }
              transformedHook.method = method;
            }

            return transformedHook;
          }),
        );

        records = records.filter(Boolean);
      }

      const created = repo.create(records);
      await repo.save(created);
      this.logger.log(
        `✅ Tạo mặc định '${tableName}' thành công (${records.length} bản ghi).`,
      );
    }
  }
}
