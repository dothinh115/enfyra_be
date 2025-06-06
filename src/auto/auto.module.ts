import { Global, Module } from '@nestjs/common';
import { AutoService } from './auto-entity.service';

@Global()
@Module({
  providers: [AutoService],
  exports: [AutoService],
})
export class AutoGenerateModule {}
