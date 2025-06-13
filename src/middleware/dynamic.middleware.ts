import {
  Injectable,
  InternalServerErrorException,
  NestMiddleware,
} from '@nestjs/common';
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
    if (!req.routeData) return next();
    for (const middleware of req.routeData.middlewares) {
      if (!middleware.handler) continue;
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
        const exec = () =>
          script.runInContext(vmContext).then?.(undefined, (err) => {
            throw err;
          });

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
        throw new InternalServerErrorException(
          `middleware error: ${err.message}`,
        );
      }
    }

    next();
  }
}
