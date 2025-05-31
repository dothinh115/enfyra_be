import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Request } from "express";
import { Repository } from "typeorm";
import * as vm from "vm";
import { RouteDefenition } from "../entities/route.entity";
import { TableDefinition } from "../entities/table.entity";
import { DataSourceService } from "../data-source/data-source.service";

@Injectable()
export class DynamicService {
  private logger = new Logger(DynamicService.name);
  constructor(
    @InjectRepository(RouteDefenition)
    private routeDefRepo: Repository<RouteDefenition>,
    @InjectRepository(TableDefinition)
    private tableDefRepo: Repository<TableDefinition>,
    private dataSourceService: DataSourceService
  ) {}
  async dynamicService(req: Request, body?: any) {
    try {
      const path = req.path;
      const method = req.method;

      const table = await this.tableDefRepo.findOne({
        where: {
          name: path.replace(/^\//, ""),
        },
        relations: {
          columns: true,
          relations: true,
        },
      });
      if (!table) {
        throw new BadRequestException(`[${method}] ${path} không tồn tại!`);
      }
      const repo = this.dataSourceService.getRepository(
        path.replace(/^\//, "")
      );
      const context = {
        $req: req,
        $body: body,
        $repo: repo,
      };
      const curRoute = await this.routeDefRepo.findOne({
        where: {
          path,
          method,
        },
      });
      if (!curRoute)
        throw new BadRequestException(`[${method}] ${path} không tồn tại!`);

      // Tạo context sandbox
      const script = new vm.Script(`(async () => { ${curRoute.handler} })()`);
      const vmContext = vm.createContext(context);

      // Phải `await` Promise trả ra từ script
      const result = await script.runInContext(vmContext);

      return result;
    } catch (error) {
      this.logger.error(error);
      throw new BadRequestException(`Lỗi script db: ${error.message}`);
    }
  }
}
