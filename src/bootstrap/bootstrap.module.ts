import { Global, Module } from '@nestjs/common';
import { BootstrapService } from './bootstrap.service';
import { CoreInitService } from './core-init.service';
import { DefaultDataService } from './default-data.service';

@Global()
@Module({
  providers: [BootstrapService, CoreInitService, DefaultDataService],
  exports: [BootstrapService, CoreInitService, DefaultDataService],
})
export class BootstrapModule {}
