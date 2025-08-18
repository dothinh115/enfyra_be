import { Global, Module } from '@nestjs/common';
import { BootstrapService } from './services/bootstrap.service';
import { CoreInitService } from './services/core-init.service';
import { DefaultDataService } from './services/default-data.service';

// Import processors
import { UserDefinitionProcessor } from './processors/user-definition.processor';
import { MenuDefinitionProcessor } from './processors/menu-definition.processor';
import { RouteDefinitionProcessor } from './processors/route-definition.processor';
import { MethodDefinitionProcessor } from './processors/method-definition.processor';
import { HookDefinitionProcessor } from './processors/hook-definition.processor';
import { SettingDefinitionProcessor } from './processors/setting-definition.processor';
import { ExtensionDefinitionProcessor } from './processors/extension-definition.processor';
import { FolderDefinitionProcessor } from './processors/folder-definition.processor';

@Global()
@Module({
  providers: [
    BootstrapService, 
    CoreInitService, 
    DefaultDataService,
    // Register processors
    UserDefinitionProcessor,
    MenuDefinitionProcessor,
    RouteDefinitionProcessor,
    MethodDefinitionProcessor,
    HookDefinitionProcessor,
    SettingDefinitionProcessor,
    ExtensionDefinitionProcessor,
    FolderDefinitionProcessor,
  ],
  exports: [BootstrapService, CoreInitService, DefaultDataService],
})
export class BootstrapModule {}
