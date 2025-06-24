import {
  BadGatewayException,
  Injectable,
  InternalServerErrorException,
  NestMiddleware,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { HandlerExecutorService } from '../handler-executor/handler-executor.service';

@Injectable()
export class DynamicMiddleware implements NestMiddleware {
  constructor(private handlerExecutorService: HandlerExecutorService) {}
  async use(
    req: Request & { routeData: any },
    res: Response,
    next: NextFunction,
  ) {
    if (!req.routeData) return next();
    for (const middleware of req.routeData.middlewares) {
      if (!middleware.handler) continue;
      try {
        const result = await this.handlerExecutorService.run(
          middleware.handler,
          req.routeData.context,
        );
        if (!result.$req) {
          throw new BadGatewayException(
            `Middleware must be returned with $req`,
          );
        }
        Object.assign(req.routeData.$req, result.$req);
      } catch (err) {
        throw new InternalServerErrorException(
          `middleware error: ${err.message}`,
        );
      }
    }

    next();
  }
}
