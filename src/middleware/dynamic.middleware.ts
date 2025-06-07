import { Injectable, NestMiddleware } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Request, Response, NextFunction } from 'express';
import { Repository } from 'typeorm';
import { CommonService } from '../common/common.service';
import * as vm from 'vm';
import { Middleware_definition } from '../entities/middleware_definition.entity';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class DynamicMiddleware implements NestMiddleware {
  constructor(
    @InjectRepository(Middleware_definition)
    private middlewareDefRepo: Repository<Middleware_definition>,
    private commonService: CommonService,
    private configService: ConfigService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const method = req.method;
    const middlewares = await this.middlewareDefRepo
      .createQueryBuilder('middleware')
      .leftJoinAndSelect('middleware.routes', 'route')
      .leftJoinAndSelect('route.mainTable', 'mainTable')
      .where('middleware.isEnabled = :enabled', { enabled: true })
      .andWhere('route.method = :method', { method })
      .getMany();

    const matchedMiddlewares = middlewares.filter((middleware) =>
      middleware.routes.find((route) =>
        this.commonService.isRouteMatched({
          routePath: route.path,
          reqPath: req.path,
          prefix: 'api',
        }),
      ),
    );
    for (const middleware of matchedMiddlewares) {
      const ctx: Record<string, any> = {};
      const $req = new Proxy(
        {},
        {
          set(target, prop: string, value) {
            ctx[prop] = value;
            return true;
          },
        },
      );

      const context = { $req, $res: res, $next: next };
      const vmContext = vm.createContext(context);
      const script = new vm.Script(`(async () => { ${middleware.handler} })()`);

      try {
        const exec = () => script.runInContext(vmContext);
        const timeout = new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error('Timeout')),
            this.configService.get<number>('MAX_VM_TIMEOUT_MS') || 1000,
          ),
        );
        await Promise.race([exec(), timeout]);

        Object.assign(req, ctx);
      } catch (err) {
        console.error(
          `Middleware "${middleware.name || '[unknown]'}" VM Error:`,
          err.message,
        );
        return res
          .status(500)
          .send(
            `Middleware "${middleware.name || '[unknown]'}" VM Error: ${err.message}`,
          );
      }
    }

    next();
  }
}
