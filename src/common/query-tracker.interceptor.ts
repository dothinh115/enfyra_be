import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { QueryTrackerService } from '../query-track/query-track.service';

@Injectable()
export class QueryTrackerInterceptor implements NestInterceptor {
  constructor(private readonly trackerService: QueryTrackerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    this.trackerService.increase();

    return next.handle().pipe(finalize(() => this.trackerService.decrease()));
  }
}
