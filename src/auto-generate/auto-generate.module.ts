import { Global, Module } from '@nestjs/common';
import { AutoGenerateService } from './auto-generate.service';

@Global()
@Module({
  providers: [AutoGenerateService],
  exports: [AutoGenerateService],
})
export class AutoGenerateModule {}
