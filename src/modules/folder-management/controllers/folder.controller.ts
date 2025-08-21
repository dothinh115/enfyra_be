import { Controller, Post, Patch, Delete, Body, Param, Req, BadRequestException, Logger } from '@nestjs/common';
import { DynamicRepository } from '../../dynamic-api/repositories/dynamic.repository';
import { RequestWithRouteData } from '../../../shared/interfaces/dynamic-context.interface';
import { FolderManagementService } from '../services/folder-management.service';
import { DataSourceService } from '../../../core/database/data-source/data-source.service';
import { TableHandlerService } from '../../table-management/services/table-handler.service';
import { QueryEngine } from '../../../infrastructure/query-engine/services/query-engine.service';
import { RouteCacheService } from '../../../infrastructure/redis/services/route-cache.service';
import { SystemProtectionService } from '../../dynamic-api/services/system-protection.service';

@Controller('folder_definition')
export class FolderController {
  private readonly logger = new Logger(FolderController.name);

  constructor(
    private folderManagementService: FolderManagementService,
    private dataSourceService: DataSourceService,
    private tableHandlerService: TableHandlerService,
    private queryEngine: QueryEngine,
    private routeCacheService: RouteCacheService,
    private systemProtectionService: SystemProtectionService,
  ) {}

  @Post()
  async createFolder(
    @Body() body: any,
    @Req() req: RequestWithRouteData,
  ) {
    this.logger.log(`📁 Creating folder: ${JSON.stringify(body)}`);
    
    let physicalFolderCreated = false;
    let createdPath: string | null = null;

    try {
      // Use DynamicRepository to handle folder creation
      const folderRepo = new DynamicRepository({
        context: req.routeData?.context,
        tableName: 'folder_definition',
        tableHandlerService: this.tableHandlerService,
        dataSourceService: this.dataSourceService,
        queryEngine: this.queryEngine,
        routeCacheService: this.routeCacheService,
        systemProtectionService: this.systemProtectionService,
      });

      await folderRepo.init();

      // Create folder record in DB using dynamic repo
      const result = await folderRepo.create(body);
      
      // Create physical folder if DB operation succeeded
      if (result && body.path) {
        createdPath = body.path;
        await this.folderManagementService.createPhysicalFolder({
          path: body.path,
          name: body.name
        });
        physicalFolderCreated = true;
      }

      this.logger.log(`✅ Folder created successfully: ${body.name}`);
      return {
        success: true,
        data: result,
        message: 'Folder created successfully',
        statusCode: 201
      };

    } catch (error) {
      this.logger.error(`❌ Folder creation failed:`, error);
      
      // Rollback physical folder if created
      if (physicalFolderCreated && createdPath) {
        await this.folderManagementService.rollbackFolderCreation(createdPath);
      }
      
      throw new BadRequestException(error.message || 'Failed to create folder');
    }
  }

  @Patch(':id')
  async updateFolder(
    @Param('id') id: string,
    @Body() body: any,
    @Req() req: RequestWithRouteData,
  ) {
    this.logger.log(`📁 Updating folder ${id}: ${JSON.stringify(body)}`);
    
    let rollbackInfo: any = null;

    try {
      // Use DynamicRepository to handle folder update
      const folderRepo = new DynamicRepository({
        context: req.routeData?.context,
        tableName: 'folder_definition',
        tableHandlerService: this.tableHandlerService,
        dataSourceService: this.dataSourceService,
        queryEngine: this.queryEngine,
        routeCacheService: this.routeCacheService,
        systemProtectionService: this.systemProtectionService,
      });

      await folderRepo.init();

      // Get current folder data for rollback
      const currentFolders = await folderRepo.find({ where: { id } });
      const currentFolder = currentFolders.data?.[0];
      if (!currentFolder) {
        throw new BadRequestException('Folder not found');
      }

      const oldPath = (currentFolder as any).path;
      const newPath = body.path;

      // Update folder record in DB using dynamic repo
      const result = await folderRepo.update(id, body);
      
      // Move physical folder if path changed
      if (result && oldPath !== newPath) {
        rollbackInfo = await this.folderManagementService.movePhysicalFolder(oldPath, newPath);
      }

      this.logger.log(`✅ Folder updated successfully: ${id}`);
      return {
        success: true,
        data: result,
        message: 'Folder updated successfully',
        statusCode: 200
      };

    } catch (error) {
      this.logger.error(`❌ Folder update failed:`, error);
      
      // Rollback physical folder move if it happened
      if (rollbackInfo) {
        await this.folderManagementService.rollbackFolderMove(rollbackInfo);
      }
      
      throw new BadRequestException(error.message || 'Failed to update folder');
    }
  }

  @Delete(':id')
  async deleteFolder(
    @Param('id') id: string,
    @Req() req: RequestWithRouteData,
  ) {
    this.logger.log(`📁 Deleting folder: ${id}`);
    
    let folderPath: string | null = null;
    let physicalFolderDeleted = false;

    try {
      // Use DynamicRepository to handle folder deletion
      const folderRepo = new DynamicRepository({
        context: req.routeData?.context,
        tableName: 'folder_definition',
        tableHandlerService: this.tableHandlerService,
        dataSourceService: this.dataSourceService,
        queryEngine: this.queryEngine,
        routeCacheService: this.routeCacheService,
        systemProtectionService: this.systemProtectionService,
      });

      await folderRepo.init();

      // Get folder data before deletion
      const folders = await folderRepo.find({ where: { id } });
      const folder = folders.data?.[0];
      if (!folder) {
        throw new BadRequestException('Folder not found');
      }

      folderPath = (folder as any).path;

      // Delete physical folder first
      if (folderPath) {
        await this.folderManagementService.deletePhysicalFolder(folderPath);
        physicalFolderDeleted = true;
      }

      // Delete folder record from DB using dynamic repo
      const result = await folderRepo.delete(id);

      this.logger.log(`✅ Folder deleted successfully: ${id}`);
      return {
        success: true,
        data: result,
        message: 'Folder deleted successfully',
        statusCode: 200
      };

    } catch (error) {
      this.logger.error(`❌ Folder deletion failed:`, error);
      
      // Rollback physical folder deletion if DB operation failed
      if (physicalFolderDeleted && folderPath) {
        await this.folderManagementService.rollbackFolderDeletion(folderPath);
      }
      
      throw new BadRequestException(error.message || 'Failed to delete folder');
    }
  }
}