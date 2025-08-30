// Base processor
export { BaseTableProcessor } from './base-table-processor';

// Essential processors (required for core functionality)
export { UserDefinitionProcessor } from './user-definition.processor';
export { MethodDefinitionProcessor } from './method-definition.processor';
export { SettingDefinitionProcessor } from './setting-definition.processor';

// Feature processors (loaded when needed)
export { MenuDefinitionProcessor } from './menu-definition.processor';
export { RouteDefinitionProcessor } from './route-definition.processor';
export { HookDefinitionProcessor } from './hook-definition.processor';
export { ExtensionDefinitionProcessor } from './extension-definition.processor';
export { FolderDefinitionProcessor } from './folder-definition.processor';
export { RouteHandlerDefinitionProcessor } from './route-handler-definition.processor';

// Generic processor (fallback for unknown tables)
export { GenericTableProcessor } from './generic-table.processor';

// Processor types and interfaces
export type { UpsertResult } from './base-table-processor';
