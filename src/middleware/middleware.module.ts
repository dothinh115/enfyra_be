import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  Module,
  NestModule,
  UnauthorizedException,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Application, NextFunction, Request, Response } from 'express';
import { RequestHandler } from '@nestjs/common/interfaces';
import { userExporterMiddleware } from './user-extract.middleware';
import { MiddlewareDefinition } from '../entities/middleware.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as vm from 'vm';

@Module({})
export class MiddlewareModule implements NestModule {
  constructor(
    private readonly adapterHost: HttpAdapterHost,
    @InjectRepository(MiddlewareDefinition)
    private middlewareRepo: Repository<MiddlewareDefinition>,
  ) {}

  async configure() {
    const app: Application = this.adapterHost.httpAdapter.getInstance();
    app.use(userExporterMiddleware as RequestHandler);

    const middlewares = await this.middlewareRepo.find();

    for (const middleware of middlewares) {
      app.use(
        async (
          req: Request & { user?: any },
          res: Response,
          next: NextFunction,
        ) => {
          const curMiddleware = await this.middlewareRepo.findOne({
            where: {
              id: middleware.id,
            },
          });

          if (!curMiddleware.isEnabled) {
            return next();
          }

          const methodMatches =
            !curMiddleware.method || curMiddleware.method === req.method;

          const pathMatches =
            !curMiddleware.path || req.path === curMiddleware.path;

          if (methodMatches && pathMatches) {
            const context = {
              $req: req,
              $body: req.body,
              $user: req.user,
              throw400: (message: string) => {
                throw new BadRequestException(message);
              },
              throw401: () => {
                throw new UnauthorizedException();
              },
              throw403: () => {
                throw new ForbiddenException();
              },
              throw500: () => {
                throw new InternalServerErrorException();
              },
              throw502: () => {
                throw new BadGatewayException();
              },
            };

            try {
              const script = new vm.Script(
                `(async () => { ${curMiddleware.handler} })()`,
              );
              const vmContext = vm.createContext(context);
              const result = await script.runInContext(vmContext);
            } catch (e) {
              console.error(`❌ Middleware error:`, e);
              throw e;
            }

            return next();
          }
          next();
        },
      );
    }
  }
}
