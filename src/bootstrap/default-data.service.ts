import { Injectable, Logger } from '@nestjs/common';
import { DataSourceService } from '../data-source/data-source.service';
import { BcryptService } from '../auth/bcrypt.service';
import * as fs from 'fs';
import * as path from 'path';

const initJson = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'src/bootstrap/init.json'), 'utf8'),
);

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

      if (
        !rawRecords ||
        (Array.isArray(rawRecords) && rawRecords.length === 0)
      ) {
        this.logger.debug(
          `❎ Table '${tableName}' has no default data, skipping.`,
        );
        continue;
      }

      this.logger.log(`🔄 Upserting table '${tableName}'`);

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

      if (tableName === 'menu_definition') {
        // Transform menu_definition records to resolve sidebar references
        const miniSidebars = records.filter((r: any) => r.type === 'mini');
        const menuItems = records.filter((r: any) => r.type === 'menu');

        // First upsert mini sidebars to get their IDs
        const sidebarNameToId = new Map();
        for (const sidebar of miniSidebars) {
          const existingSidebar = await repo.findOne({
            where: { type: sidebar.type, label: sidebar.label },
          });

          if (existingSidebar) {
            sidebarNameToId.set(sidebar.label, (existingSidebar as any).id);
          } else {
            const created = repo.create(sidebar);
            const saved = await repo.save(created);
            sidebarNameToId.set(sidebar.label, (saved as any).id);
          }
        }

        // Transform menu items with proper sidebar references
        records = menuItems.map((menuItem: any) => {
          const transformed = { ...menuItem };
          if (menuItem.sidebar && sidebarNameToId.has(menuItem.sidebar)) {
            transformed.sidebar = sidebarNameToId.get(menuItem.sidebar);
          }
          return transformed;
        });

        // Add mini sidebars back to records for upsert
        records = [...miniSidebars, ...records];
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

      // Perform upsert for each record
      let createdCount = 0;
      let updatedCount = 0;

      for (const record of records) {
        try {
          // Try to find existing record based on unique identifiers
          let existingRecord = null;

          if (tableName === 'user_definition') {
            existingRecord = await repo.findOne({
              where: { username: (record as any).username },
            });
          } else if (tableName === 'route_definition') {
            existingRecord = await repo.findOne({
              where: { path: (record as any).path },
            });
          } else if (tableName === 'table_definition') {
            existingRecord = await repo.findOne({
              where: { name: (record as any).name },
            });
          } else if (tableName === 'role_definition') {
            existingRecord = await repo.findOne({
              where: { name: (record as any).name },
            });
          } else if (tableName === 'method_definition') {
            existingRecord = await repo.findOne({
              where: { method: (record as any).method },
            });
          } else if (tableName === 'setting_definition') {
            existingRecord = await repo.findOne({
              where: { key: (record as any).key },
            });
          } else if (tableName === 'session_definition') {
            existingRecord = await repo.findOne({
              where: { name: (record as any).name },
            });
          } else if (tableName === 'hook_definition') {
            // Chỉ check theo name, không query qua many-to-many relationships
            existingRecord = await repo.findOne({
              where: { name: (record as any).name },
              select: ['id', 'name'], // Chỉ select các field cần thiết
            });
          } else if (tableName === 'column_definition') {
            existingRecord = await repo.findOne({
              where: {
                table: (record as any).table,
                name: (record as any).name,
              },
            });
          } else if (tableName === 'relation_definition') {
            existingRecord = await repo.findOne({
              where: {
                table: (record as any).table,
                name: (record as any).name,
              },
            });
          } else if (tableName === 'route_permission_definition') {
            existingRecord = await repo.findOne({
              where: {
                route: (record as any).route,
                role: (record as any).role,
              },
            });
          } else if (tableName === 'route_handler_definition') {
            existingRecord = await repo.findOne({
              where: {
                route: (record as any).route,
                method: (record as any).method,
              },
            });
          } else if (tableName === 'menu_definition') {
            // Special handling for menu_definition to resolve sidebar/parent references
            if ((record as any).type === 'mini') {
              // For mini sidebars, check by type + label
              existingRecord = await repo.findOne({
                where: {
                  type: (record as any).type,
                  label: (record as any).label,
                },
              });
            } else if ((record as any).type === 'menu') {
              // For menu items, check by type + label + sidebar
              const sidebar = await repo.findOne({
                where: {
                  type: 'mini',
                  label: (record as any).sidebar,
                },
              });
              if (sidebar) {
                existingRecord = await repo.findOne({
                  where: {
                    type: (record as any).type,
                    label: (record as any).label,
                    sidebar: (sidebar as any).id,
                  },
                });
              } else {
                // Nếu không tìm thấy sidebar, vẫn phải check exists để tránh duplicate
                existingRecord = await repo.findOne({
                  where: {
                    type: (record as any).type,
                    label: (record as any).label,
                  },
                });
              }
            } else {
              // Fallback check for other types (nếu có)
              existingRecord = await repo.findOne({
                where: {
                  type: (record as any).type,
                  label: (record as any).label,
                },
              });
            }
          }

          if (existingRecord) {
            // Update existing record - xử lý đặc biệt cho many-to-many relationships
            if (tableName === 'hook_definition') {
              // Với hook_definition, cần xử lý many-to-many methods riêng biệt
              const { methods, ...updateData } = record;

              // Update các field cơ bản
              await repo.update((existingRecord as any).id, updateData);

              // Xử lý many-to-many methods nếu có
              if (methods && Array.isArray(methods)) {
                const hookRepo = repo as any;
                await hookRepo.save({
                  id: (existingRecord as any).id,
                  methods: methods,
                });
              }
            } else {
              // Update bình thường cho các table khác
              await repo.update((existingRecord as any).id, record);
            }

            updatedCount++;
            this.logger.debug(
              `🔄 Updated ${tableName}: ${JSON.stringify(record).substring(0, 50)}...`,
            );
          } else {
            // Create new record
            const created = repo.create(record);
            await repo.save(created);
            createdCount++;
            this.logger.debug(
              `✅ Created ${tableName}: ${JSON.stringify(record).substring(0, 50)}...`,
            );
          }
        } catch (error) {
          this.logger.error(
            `❌ Error upserting ${tableName}: ${error.message}`,
          );
        }
      }

      this.logger.log(
        `✅ Successfully upserted '${tableName}' (${createdCount} created, ${updatedCount} updated).`,
      );
    }
  }
}
