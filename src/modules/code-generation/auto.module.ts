import { Global, Module } from '@nestjs/common';
import { CommonModule } from '../../shared/common/common.module';
import { AutoService } from './services/auto.service';

@Global()
@Module({
  imports: [CommonModule],
  providers: [AutoService],
  exports: [AutoService],
})
export class AutoModule {}
