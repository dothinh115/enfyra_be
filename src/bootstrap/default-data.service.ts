import { Injectable, Logger } from '@nestjs/common';
import { DataSourceService } from '../data-source/data-source.service';
import { BcryptService } from '../auth/bcrypt.service';
import * as fs from 'fs';
import * as path from 'path';

const initJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'src/bootstrap/init.json'), 'utf8'));

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
          `❎ Table '${tableName}' has no default data, skipping.`,
        );
        continue;
      }

      if (count > 0) {
        this.logger.debug(`⏩ Table '${tableName}' already has data, skipping.`);
        continue;
      }

      this.logger.log(`📥 Initializing table '${tableName}'`);

      let records = Array.isArray(rawRecords) ? rawRecords : [rawRecords];

      // Plugin: special handling if needed
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
                `⚠️ Table '${r.mainTable}' not found for route ${r.path}, skipping.`,
              );
              return null;
            }
            return {
              ...r,
              mainTable,
            };
          }),
        );
        records = records.filter(Boolean); // remove undefined
      }

      if (tableName === 'method_definition') {
        const settingRepo =
          this.dataSourceService.getRepository('setting_definition');
        const setting = await settingRepo.findOne({ where: {} });
        if (!setting) {
          this.logger.warn(`⚠️ No settings to assign permissions, skipping.`);
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

            // Mapping route
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
                  `⚠️ Route '${hook.route}' not found for hook '${hook.name}', skipping.`,
                );
                return null;
              }
              transformedHook.route = route;
            }

            // ✅ Mapping methods (many-to-many)
            if (hook.methods && Array.isArray(hook.methods)) {
              const methodEntities = await methodRepo.find({
                where: hook.methods.map((m: string) => ({ method: m })),
              });

              if (methodEntities.length !== hook.methods.length) {
                const notFound = hook.methods.filter(
                  (m: string) =>
                    !methodEntities.find((me: any) => me.method === m),
                );
                this.logger.warn(
                  `⚠️ Method(s) '${notFound.join(', ')}' not found for hook '${hook.name}', skipping.`,
                );
                return null;
              }

              transformedHook.methods = methodEntities;
            }

            return transformedHook;
          }),
        );

        records = records.filter(Boolean);
      }

      const created = repo.create(records);
      await repo.save(created);
      this.logger.log(
        `✅ Successfully created default '${tableName}' (${records.length} records).`,
      );
    }
  }
}
