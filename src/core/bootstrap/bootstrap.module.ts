import { Global, Module, forwardRef } from '@nestjs/common';
import { CommonModule } from '../../shared/common/common.module';
import { ExceptionsModule } from '../exceptions/exceptions.module';
import { DataSourceModule } from '../database/data-source/data-source.module';
import { AuthModule } from '../auth/auth.module';
import { SchemaManagementModule } from '../../modules/schema-management/schema-management.module';
import { RedisModule } from '../../infrastructure/redis/redis.module';

// Import all services from index
import {
  BootstrapService,
  CoreInitService,
  DefaultDataService,
  ProcessorFactoryService,
} from './services';

// Import only essential processors from index
import {
  UserDefinitionProcessor,
  MethodDefinitionProcessor,
  SettingDefinitionProcessor,
} from './processors';

@Global()
@Module({
  imports: [
    CommonModule, // Shared utilities
    ExceptionsModule, // Error handling
    DataSourceModule, // Database access
    AuthModule, // For BcryptService
    forwardRef(() => SchemaManagementModule), // Schema management services
    forwardRef(() => RedisModule), // Redis services
  ],
  providers: [
    // Core services
    BootstrapService,
    CoreInitService,
    DefaultDataService,
    ProcessorFactoryService,

    // Only essential processors - others are lazy loaded by ProcessorFactoryService
    UserDefinitionProcessor, // User management (required for auth)
    MethodDefinitionProcessor, // HTTP methods (required for routes)
    SettingDefinitionProcessor, // System settings (required for config)
  ],
  exports: [BootstrapService, CoreInitService, DefaultDataService],
})
export class BootstrapModule {}
