import { Global, Module } from '@nestjs/common';
import { BootstrapService } from './services/bootstrap.service';
import { CoreInitService } from './services/core-init.service';
import { DefaultDataService } from './services/default-data.service';

@Global()
@Module({
  providers: [BootstrapService, CoreInitService, DefaultDataService],
  exports: [BootstrapService, CoreInitService, DefaultDataService],
})
export class BootstrapModule {}
