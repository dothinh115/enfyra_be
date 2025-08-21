import { BadRequestException } from '@nestjs/common';
import { DataSourceService } from '../../../core/database/data-source/data-source.service';
import { Repository } from 'typeorm';
import { TableHandlerService } from '../../table-management/services/table-handler.service';
import { QueryEngine } from '../../../infrastructure/query-engine/services/query-engine.service';
import { RouteCacheService } from '../../../infrastructure/redis/services/route-cache.service';
import { SystemProtectionService } from '../services/system-protection.service';
import { FolderManagementService } from '../../folder-management/services/folder-management.service';
import { TDynamicContext } from '../../../shared/interfaces/dynamic-context.interface';

export class DynamicRepository {
  private context: TDynamicContext;
  private tableName: string;
  private queryEngine: QueryEngine;
  private dataSourceService: DataSourceService;
  private repo: Repository<any>;
  private tableHandlerService: TableHandlerService;
  private routeCacheService: RouteCacheService;
  private systemProtectionService: SystemProtectionService;
  private folderManagementService?: FolderManagementService;

  constructor({
    context,
    tableName,
    queryEngine,
    dataSourceService,
    tableHandlerService,
    routeCacheService,
    systemProtectionService,
    folderManagementService,
  }: {
    context: TDynamicContext;
    tableName: string;
    queryEngine: QueryEngine;
    dataSourceService: DataSourceService;
    tableHandlerService: TableHandlerService;
    routeCacheService: RouteCacheService;
    systemProtectionService: SystemProtectionService;
    folderManagementService?: FolderManagementService;
  }) {
    this.context = context;
    this.tableName = tableName;
    this.queryEngine = queryEngine;
    this.dataSourceService = dataSourceService;
    this.tableHandlerService = tableHandlerService;
    this.routeCacheService = routeCacheService;
    this.systemProtectionService = systemProtectionService;
    this.folderManagementService = folderManagementService;
  }

  async init() {
    this.repo = this.dataSourceService.getRepository(this.tableName);
  }

  async find(opt: { where?: any }) {
    return await this.queryEngine.find({
      tableName: this.tableName,
      fields: this.context.$query?.fields || '',
      filter: opt?.where || this.context.$query?.filter || {},
      page: this.context.$query?.page || 1,
      limit: this.context.$query?.limit || 10,
      meta: this.context.$query?.meta,
      sort: this.context.$query?.sort || 'id',
      aggregate: this.context.$query?.aggregate || {},
      deep: this.context.$query?.deep || {},
    });
  }

  async create(body: any) {
    
    try {
      await this.systemProtectionService.assertSystemSafe({
        operation: 'create',
        tableName: this.tableName,
        data: body,
        existing: null,
        currentUser: this.context.$user,
      });

      if (this.tableName === 'table_definition') {
        body.isSystem = false;
        const table: any = await this.tableHandlerService.createTable(body);
        await this.reload();
        return await this.find({ where: { id: { _eq: table.id } } });
      }

      if (this.tableName === 'folder_definition' && this.folderManagementService && body.path) {
        await this.folderManagementService.createPhysicalFolder({
          path: body.path,
          name: body.name
        });
      }


      const created: any = await this.repo.save(body);
      const result = await this.find({ where: { id: { _eq: created.id } } });
      await this.reload();
      return result;
    } catch (error) {
      console.error('❌ Error in dynamic repo [create]:', error);

      // Rollback physical folder creation if DB operation failed
      if (this.tableName === 'folder_definition' && body.path && this.folderManagementService) {
        try {
          await this.folderManagementService.rollbackFolderCreation(body.path);
        } catch (rollbackError) {
          console.error('❌ Failed to rollback physical folder creation:', rollbackError);
        }
      }


      throw new BadRequestException(error.message);
    }
  }

  async update(id: string | number, body: any) {
    try {
      const exists = await this.repo.findOne({ where: { id } });
      if (!exists) throw new BadRequestException(`id ${id} is not exists!`);

      await this.systemProtectionService.assertSystemSafe({
        operation: 'update',
        tableName: this.tableName,
        data: body,
        existing: exists,
        currentUser: this.context.$user,
      });

      if (this.tableName === 'table_definition') {
        const table: any = await this.tableHandlerService.updateTable(
          +id,
          body,
        );
        return this.find({ where: { id: { _eq: table.id } } });
      }

      let rollbackInfo: any = null;
      if (this.tableName === 'folder_definition' && this.folderManagementService && body.path !== (exists as any).path) {
        rollbackInfo = await this.folderManagementService.movePhysicalFolder(
          (exists as any).path,
          body.path
        );
      }


      body.id = exists.id;

      try {
        await this.repo.save(body);
      } catch (dbError) {
        // Rollback physical folder move if DB update failed
        if (rollbackInfo && this.folderManagementService) {
          await this.folderManagementService.rollbackFolderMove(rollbackInfo);
        }
        
        
        throw dbError;
      }

      const result = await this.find({ where: { id: { _eq: id } } });
      await this.reload();
      return result;
    } catch (error) {
      console.error('❌ Error in dynamic repo [update]:', error);
      throw new BadRequestException(error.message);
    }
  }

  async delete(id: string | number) {
    try {
      const exists = await this.repo.findOne({ where: { id } });
      if (!exists) throw new BadRequestException(`id ${id} is not exists!`);

      await this.systemProtectionService.assertSystemSafe({
        operation: 'delete',
        tableName: this.tableName,
        data: {},
        existing: exists,
        currentUser: this.context.$user,
      });

      if (this.tableName === 'table_definition') {
        await this.tableHandlerService.delete(+id);
        return { message: 'Success', statusCode: 200 };
      }


      if (this.tableName === 'folder_definition' && this.folderManagementService) {
        await this.folderManagementService.deletePhysicalFolder((exists as any).path);
      }


      try {
        await this.repo.delete(id);
      } catch (dbError) {
        // Rollback physical deletion if DB deletion failed
        if (this.tableName === 'folder_definition' && this.folderManagementService) {
          try {
            await this.folderManagementService.rollbackFolderDeletion((exists as any).path);
          } catch (rollbackError) {
            console.error('❌ Failed to rollback physical folder deletion:', rollbackError);
          }
        }

        
        throw dbError;
      }

      await this.reload();
      return { message: 'Delete successfully!', statusCode: 200 };
    } catch (error) {
      console.error('❌ Error in dynamic repo [delete]:', error);
      throw new BadRequestException(error.message);
    }
  }

  private async reload() {
    if (
      [
        'table_definition',
        'route_definition',
        'hook_definition',
        'route_handler_definition',
        'route_permission_definition',
        'role_definition',
      ].includes(this.tableName)
    ) {
      await this.routeCacheService.reloadRouteCache();
    }
  }
}
