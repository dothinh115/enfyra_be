import { Global, Module } from '@nestjs/common';
import { SchemaManagementModule } from '../schema-management/schema-management.module';
import { ExceptionsModule } from '../../core/exceptions/exceptions.module';
import { TableHandlerService } from './services/table-handler.service';

@Global()
@Module({
  imports: [SchemaManagementModule, ExceptionsModule],
  providers: [TableHandlerService],
  exports: [TableHandlerService],
})
export class TableModule {}
