import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DataSourceService } from '../data-source/data-source.service';
import { Route } from '../dynamic-entities/route.entity'; // Đảm bảo entity này được định nghĩa đúng
const initJson = require('./init.json');

@Injectable()
export class BootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BootstrapService.name);

  constructor(private readonly dataSourceService: DataSourceService) {}

  async onApplicationBootstrap() {
    await this.insertIfTableIsEmpty('setting', initJson.defaultSetting);
    await this.insertIfTableIsEmpty('role', initJson.defaultRole);
    await this.insertIfTableIsEmpty('user', initJson.defaultUser);
    await this.createAndInsertRoutes();
  }

  private async insertIfTableIsEmpty(tableName: string, data: any) {
    const repo = this.dataSourceService.getRepository(tableName);

    const count = await repo.count();

    if (count === 0) {
      this.logger.log(
        `Bảng '${tableName}' chưa có dữ liệu, tiến hành thêm mặc định.`,
      );
      await repo.save(data);
      this.logger.log(
        `Thêm dữ liệu mặc định cho bảng '${tableName}' thành công.`,
      );
    } else {
      this.logger.debug(`Bảng '${tableName}' đã có dữ liệu, bỏ qua.`);
    }
  }

  private async createAndInsertRoutes() {
    const paths = ['role', 'setting', 'user'];
    const routeDefinitions = initJson.routeDefinition;
    const routesToInsert: Route[] = [];
    let recordsAddedCount = 0; // Thêm biến đếm số bản ghi được thêm
    const repo = this.dataSourceService.getRepository('route');
    for (const path of paths) {
      for (const methodType of Object.keys(routeDefinitions)) {
        const routeData = routeDefinitions[methodType];

        if (routeData && routeData.method && routeData.handler) {
          const fullPath = `/${path}`; // Đường dẫn đầy đủ
          const method = routeData.method;

          // Kiểm tra sự tồn tại của route dựa trên path và method
          const existingRoute = await repo.findOne({
            where: { path: fullPath, method: method },
          });

          if (!existingRoute) {
            // Nếu route chưa tồn tại, tạo mới và thêm vào danh sách
            const newRoute = repo.create({
              path: fullPath,
              method: method,
              handler: routeData.handler,
            });
            routesToInsert.push(newRoute as any);
          } else {
            this.logger.debug(
              `Route đã tồn tại: path='${fullPath}', method='${method}'. Bỏ qua.`,
            );
          }
        } else {
          this.logger.warn(
            `Thiếu method hoặc handler cho ${methodType} trong routeDefinition.`,
          );
        }
      }
    }

    if (routesToInsert.length > 0) {
      this.logger.log(
        `Tiến hành thêm ${routesToInsert.length} records route mới vào bảng 'routeDefenition'.`,
      );
      await repo.save(routesToInsert);
      this.logger.log(
        `Thêm ${routesToInsert.length} records route vào bảng 'routeDefenition' thành công.`,
      );
    } else {
      this.logger.debug(
        "Không có records route mới nào để thêm vào bảng 'routeDefenition'.",
      );
    }
  }
}
