import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { mergeMap } from 'rxjs/operators';
import { Observable } from 'rxjs';
import { HandlerExecutorService } from '../handler-executor/handler-executor.service';

@Injectable()
export class DynamicInterceptor<T> implements NestInterceptor<T, any> {
  constructor(private handlerExecurtorService: HandlerExecutorService) {}
  async intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Promise<Observable<any>> {
    const req = context.switchToHttp().getRequest();
    const hooks = req.routeData?.hooks;
    if (hooks?.length) {
      for (const hook of hooks) {
        try {
          const code = hook.preHook;
          await this.handlerExecurtorService.run(code, req.routeData.context);
        } catch (error) {
          throw error;
        }
      }
    }
    return next.handle().pipe(
      mergeMap(async (data) => {
        if (hooks?.length) {
          for (const hook of hooks) {
            try {
              const code = hook.afterHook;
              req.routeData.context.$data = req.routeData.context.$data || data;
              req.routeData.context.$statusCode = context
                .switchToHttp()
                .getResponse().statusCode;
              await this.handlerExecurtorService.run(
                code,
                req.routeData.context,
              );
              data = req.routeData.context.$data;
            } catch (error) {
              throw error;
            }
          }
        }
        return data;
      }),
    );
  }
}
