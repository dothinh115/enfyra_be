import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { HIDDEN_FIELD_KEY } from '../utils/constant';

@Injectable()
export class HideFieldInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(map((data) => this.sanitizeResponse(data)));
  }

  sanitizeResponse(data: any): any {
    if (Array.isArray(data)) {
      return data.map((item) => this.sanitizeObject(item));
    } else if (typeof data === 'object' && data !== null) {
      return this.sanitizeObject(data);
    }
    return data;
  }

  sanitizeObject(obj: any): any {
    const sanitized = { ...obj };
    const prototype = Object.getPrototypeOf(obj);
    if (!prototype) return sanitized;

    for (const key of Object.keys(sanitized)) {
      const isHidden = Reflect.getMetadata(HIDDEN_FIELD_KEY, prototype, key);
      if (isHidden) {
        delete sanitized[key];
      }
    }

    return sanitized;
  }
}
