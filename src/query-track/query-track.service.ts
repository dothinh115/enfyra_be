import { Injectable } from '@nestjs/common';

@Injectable()
export class QueryTrackerService {
  private activeCount = 0;

  increase() {
    this.activeCount++;
  }

  decrease() {
    this.activeCount--;
  }

  isIdle(): boolean {
    return this.activeCount <= 1;
  }

  getCount(): number {
    return this.activeCount;
  }
}
