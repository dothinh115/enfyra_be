import { Global, Module } from '@nestjs/common';
import { CommonModule } from '../../../shared/common/common.module';
import { ExceptionsModule } from '../../exceptions/exceptions.module';
import { DataSourceService } from './data-source.service';

@Global()
@Module({
  imports: [CommonModule, ExceptionsModule],
  providers: [DataSourceService],
  exports: [DataSourceService],
})
export class DataSourceModule {}
