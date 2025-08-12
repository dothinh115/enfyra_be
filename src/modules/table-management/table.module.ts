import { Global, Module } from '@nestjs/common';
import { TableHandlerService } from './services/table.service';

@Global()
@Module({
  imports: [],
  providers: [TableHandlerService],
  exports: [TableHandlerService],
})
export class TableModule {}
