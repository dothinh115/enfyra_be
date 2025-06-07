import { Injectable, NestMiddleware } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Request, Response, NextFunction } from 'express';
import { Repository } from 'typeorm';
import { CommonService } from '../common/common.service';
import * as vm from 'vm';
import { Middleware_definition } from '../entities/middleware_definition.entity';

@Injectable()
export class DynamicMiddleware implements NestMiddleware {
  constructor(
    @InjectRepository(Middleware_definition)
    private middlewareDefRepo: Repository<Middleware_definition>,
    private commonService: CommonService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const method = req.method;
    const middlewares = await this.middlewareDefRepo.find({
      where: {
        isEnabled: true,
      },
    });

    // for (const route of routes) {
    //   const ifMatched = this.commonService.isRouteMatched({
    //     routePath: route.path,
    //     reqPath: req.path,
    //     prefix: 'api',
    //   });

    //   if (!ifMatched) continue;

    //   const ctx: Record<string, any> = {};

    //   const $req = new Proxy(
    //     {},
    //     {
    //       set(target, prop: string, value) {
    //         ctx[prop] = value;
    //         return true;
    //       },
    //     },
    //   );

    //   const context = {
    //     $req,
    //   };

    //   const vmContext = vm.createContext(context);
    //   const script = new vm.Script(`(async () => { ${route.handler} })()`);

    //   try {
    //     await script.runInContext(vmContext, { timeout: 1000 });
    //     Object.assign(req, ctx);
    //   } catch (err) {
    //     console.error('Middleware VM Error:', err);
    //     return res.status(500).send('Middleware handler failed.');
    //   }
    // }

    next();
  }
}
