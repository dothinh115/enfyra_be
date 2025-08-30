import { Module } from '@nestjs/common';
import { CommonModule } from '../../shared/common/common.module';
import { ExceptionsModule } from '../../core/exceptions/exceptions.module';
import { DynamicService } from './services/dynamic.service';
import { DynamicController } from './controllers/dynamic.controller';
import { SystemProtectionService } from './services/system-protection.service';

@Module({
  imports: [CommonModule, ExceptionsModule],
  controllers: [DynamicController],
  providers: [DynamicService, SystemProtectionService],
  exports: [SystemProtectionService],
})
export class DynamicModule {}
