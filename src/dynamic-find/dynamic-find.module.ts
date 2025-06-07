import { Global, Module } from '@nestjs/common';
import { DynamicFindService } from './dynamic-find.service';

@Global()
@Module({
  providers: [DynamicFindService],
  exports: [DynamicFindService],
})
export class DynamicFindModule {}
