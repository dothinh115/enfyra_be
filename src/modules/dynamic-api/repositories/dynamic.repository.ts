import { BadRequestException } from '@nestjs/common';
import { DataSourceService } from '../../../core/database/data-source/data-source.service';
import { Repository } from 'typeorm';
import { TableHandlerService } from '../../table-management/services/table-handler.service';
import { QueryEngine } from '../../../infrastructure/query-engine/services/query-engine.service';
import { RouteCacheService } from '../../../infrastructure/redis/services/route-cache.service';
import { SystemProtectionService } from '../services/system-protection.service';
import { FolderManagementService } from '../../folder-management/services/folder-management.service';
import { FileManagementService } from '../../file-management/services/file-management.service';
import { TDynamicContext } from '../../../shared/utils/types/dynamic-context.type';

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
  private fileManagementService?: FileManagementService;

  constructor({
    context,
    tableName,
    queryEngine,
    dataSourceService,
    tableHandlerService,
    routeCacheService,
    systemProtectionService,
    folderManagementService,
    fileManagementService,
  }: {
    context: TDynamicContext;
    tableName: string;
    queryEngine: QueryEngine;
    dataSourceService: DataSourceService;
    tableHandlerService: TableHandlerService;
    routeCacheService: RouteCacheService;
    systemProtectionService: SystemProtectionService;
    folderManagementService?: FolderManagementService;
    fileManagementService?: FileManagementService;
  }) {
    this.context = context;
    this.tableName = tableName;
    this.queryEngine = queryEngine;
    this.dataSourceService = dataSourceService;
    this.tableHandlerService = tableHandlerService;
    this.routeCacheService = routeCacheService;
    this.systemProtectionService = systemProtectionService;
    this.folderManagementService = folderManagementService;
    this.fileManagementService = fileManagementService;
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
    console.log(`🔍 DynamicRepository.create - tableName: ${this.tableName}`);
    console.log(`🔍 DynamicRepository.create - body:`, body);
    console.log(`🔍 DynamicRepository.create - context.$body:`, this.context.$body);
    console.log(`🔍 DynamicRepository.create - context.$uploadedFile:`, this.context.$uploadedFile ? 'EXISTS' : 'MISSING');
    
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

      // Handle file upload for file_definition table
      if (this.tableName === 'file_definition' && this.fileManagementService && this.context.$uploadedFile) {
        const processedFile = await this.fileManagementService.processFileUpload({
          filename: this.context.$uploadedFile.originalname,
          mimetype: this.context.$uploadedFile.mimetype,
          buffer: this.context.$uploadedFile.buffer,
          size: this.context.$uploadedFile.size,
          folder: body.folder || null,
          title: body.title,
          description: body.description,
          visibility: body.visibility
        });

        // Merge processed file data with body
        Object.assign(body, processedFile);
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

      // Rollback physical file creation if DB operation failed
      if (this.tableName === 'file_definition' && body.location && this.fileManagementService) {
        try {
          await this.fileManagementService.rollbackFileCreation(body.location);
        } catch (rollbackError) {
          console.error('❌ Failed to rollback physical file creation:', rollbackError);
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

      // Handle file location update for file_definition table
      let fileRollbackInfo: any = null;
      if (this.tableName === 'file_definition' && this.fileManagementService && body.folder && body.folder !== (exists as any).folder) {
        const oldLocation = (exists as any).location;
        const newLocation = this.fileManagementService.generateFileUrl(
          (exists as any).filename_disk,
          body.folder
        );
        
        fileRollbackInfo = await this.fileManagementService.movePhysicalFile(oldLocation, newLocation);
        body.location = newLocation;
      }

      body.id = exists.id;

      try {
        await this.repo.save(body);
      } catch (dbError) {
        // Rollback physical folder move if DB update failed
        if (rollbackInfo && this.folderManagementService) {
          await this.folderManagementService.rollbackFolderMove(rollbackInfo);
        }
        
        // Rollback physical file move if DB update failed
        if (fileRollbackInfo && this.fileManagementService) {
          await this.fileManagementService.rollbackFileMove(fileRollbackInfo, body.location);
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

      // Handle physical file deletion for file_definition table
      if (this.tableName === 'file_definition' && this.fileManagementService) {
        await this.fileManagementService.deletePhysicalFile((exists as any).location);
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

        // For file deletion rollback, we would need to restore the file
        // This is complex and typically handled by backup systems in production
        if (this.tableName === 'file_definition' && this.fileManagementService) {
          console.warn('⚠️ File deletion rollback not implemented - file may be lost');
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
