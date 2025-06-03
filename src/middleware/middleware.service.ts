import {
  BadGatewayException,
  BadRequestException,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { CanActivate } from '../../node_modules/@nestjs/common/interfaces/features/can-activate.interface.d';
import { InjectRepository } from '@nestjs/typeorm';
import { MiddlewareDefinition } from '../entities/middleware.entity';
import { Repository } from 'typeorm';
import * as vm from 'vm';
import { Request } from 'express';
@Injectable()
export class MiddlewareService implements CanActivate {
  constructor(
    @InjectRepository(MiddlewareDefinition)
    private middlewareRepo: Repository<MiddlewareDefinition>,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: any }>();

    const method = req.method;
    const path = req.path;
    const middlewares = await this.middlewareRepo.find({
      where: {
        isEnabled: true,
      },
    });
    for (const middleware of middlewares) {
      const methodMatches = !middleware.method || middleware.method === method;
      const pathMatches = !middleware.path || middleware.path === path;

      if (methodMatches && pathMatches) {
        const vmContext = vm.createContext({
          $req: req,
          $body: req.body,
          $user: req.user,
          throw400: (msg: string) => {
            throw new BadRequestException(msg);
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
        });

        try {
          const script = new vm.Script(
            `(async () => { ${middleware.handler} })()`,
          );
          await script.runInContext(vmContext, { timeout: 3000 });
        } catch (err) {
          // Cho phép propagate lỗi đã được ném ra trong middleware script
          throw err instanceof Error
            ? err
            : new BadRequestException('Middleware execution failed');
        }
      }
    }
    return true;
  }
}
