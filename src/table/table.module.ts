import { Global, Module } from '@nestjs/common';
import { TableHandlerService } from './table.service';

@Global()
@Module({
  imports: [],
  providers: [TableHandlerService],
  exports: [TableHandlerService],
})
export class TableModule {}
