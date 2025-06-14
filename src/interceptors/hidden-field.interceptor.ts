import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { DataSource, EntityMetadata } from 'typeorm';
import { HIDDEN_FIELD_KEY } from '../utils/constant';

@Injectable()
export class HideFieldInterceptor implements NestInterceptor {
  constructor(private readonly dataSource: DataSource) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(map((data) => this.sanitizeDeep(data)));
  }

  private sanitizeDeep(value: any): any {
    if (Array.isArray(value)) {
      return value.map((v) => this.sanitizeDeep(v));
    }

    if (value && typeof value === 'object') {
      const sanitized = this.sanitizeObject(value);
      for (const key of Object.keys(sanitized)) {
        sanitized[key] = this.sanitizeDeep(sanitized[key]);
      }
      return sanitized;
    }

    return value;
  }

  private sanitizeObject(obj: any): any {
    if (!obj || typeof obj !== 'object') return obj;

    const sanitized = { ...obj };
    const matchedMetas = this.findMatchingEntityMetas(obj);

    for (const meta of matchedMetas) {
      if (typeof meta.target !== 'function') continue;
      const prototype = meta.target.prototype;

      for (const column of meta.columns) {
        const key = column.propertyName;
        const isHidden = Reflect.getMetadata(HIDDEN_FIELD_KEY, prototype, key);
        if (isHidden) {
          delete sanitized[key];
        }
      }
    }

    return sanitized;
  }

  private findMatchingEntityMetas(obj: any): EntityMetadata[] {
    return this.dataSource.entityMetadatas.filter((meta) =>
      meta.columns.every((col) => col.propertyName in obj),
    );
  }
}
