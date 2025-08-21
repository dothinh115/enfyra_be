import { Controller, Post, Patch, Delete, Body, Param, Req, BadRequestException, Logger } from '@nestjs/common';
import { RequestWithRouteData } from '../../../shared/interfaces/dynamic-context.interface';
import { FolderManagementService } from '../services/folder-management.service';

@Controller('folder_definition')
export class FolderController {
  private readonly logger = new Logger(FolderController.name);

  constructor(
    private folderManagementService: FolderManagementService,
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
      // Use existing DynamicRepository from context (already initialized with prehook modifications)
      const folderRepo = req.routeData?.context?.$repos?.main || req.routeData?.context?.$repos?.folder_definition;
      
      if (!folderRepo) {
        throw new BadRequestException('Repository not found in context');
      }

      // Create folder record in DB using existing repo (with prehook modifications)
      const result = await folderRepo.create(req.routeData.context.$body);
      
      // Create physical folder if DB operation succeeded  
      const modifiedBody = req.routeData.context.$body;
      if (result && modifiedBody.path) {
        createdPath = modifiedBody.path;
        await this.folderManagementService.createPhysicalFolder({
          path: modifiedBody.path,
          name: modifiedBody.name
        });
        physicalFolderCreated = true;
      }

      this.logger.log(`✅ Folder created successfully: ${modifiedBody.name}`);
      return result;

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
      // Use existing DynamicRepository from context
      const folderRepo = req.routeData?.context?.$repos?.main || req.routeData?.context?.$repos?.folder_definition;
      
      if (!folderRepo) {
        throw new BadRequestException('Repository not found in context');
      }

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
      return result;

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
      // Use existing DynamicRepository from context
      const folderRepo = req.routeData?.context?.$repos?.main || req.routeData?.context?.$repos?.folder_definition;
      
      if (!folderRepo) {
        throw new BadRequestException('Repository not found in context');
      }

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
      return result;

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