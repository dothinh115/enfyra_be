import { Global, Module } from '@nestjs/common';
import { AutoService } from './auto.service';

@Global()
@Module({
  providers: [AutoService],
  exports: [AutoService],
})
export class AutoGenerateModule {}
