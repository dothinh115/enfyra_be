import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as vm from 'vm';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class DynamicMiddleware implements NestMiddleware {
  constructor(private configService: ConfigService) {}

  async use(
    req: Request & { routeData: any },
    res: Response,
    next: NextFunction,
  ) {
    for (const middleware of req.routeData.middlewares) {
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
