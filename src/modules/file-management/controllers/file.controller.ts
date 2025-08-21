import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Req,
  Body,
  Query,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { FileManagementService } from '../services/file-management.service';
import { DataSourceService } from '../../../core/database/data-source/data-source.service';
import {
  RequestWithRouteData,
  TDynamicContext,
} from '../../../shared/interfaces/dynamic-context.interface';
import { DynamicRepository } from '../../dynamic-api/repositories/dynamic.repository';
import { QueryEngine } from '../../../infrastructure/query-engine/services/query-engine.service';
import { RouteCacheService } from '../../../infrastructure/redis/services/route-cache.service';
import { SystemProtectionService } from '../../dynamic-api/services/system-protection.service';
import { TableHandlerService } from '../../table-management/services/table-handler.service';
import { FolderManagementService } from '../../folder-management/services/folder-management.service';

@Controller('file_definition')
export class FileController {
  constructor(
    private fileManagementService: FileManagementService,
    private dataSourceService: DataSourceService,
    private queryEngine: QueryEngine,
    private routeCacheService: RouteCacheService,
    private systemProtectionService: SystemProtectionService,
    private tableHandlerService: TableHandlerService,
    private folderManagementService: FolderManagementService,
  ) {}

  /**
   * Upload a new file
   */
  @Post()
  async uploadFile(
    @Body() body: any,
    @Req() req: RequestWithRouteData,
  ) {
    // File is parsed by FileUploadMiddleware and available in req.file
    const file = req.file;
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    // Process folder if provided - convert to object format
    let folderData = null;
    if (body.folder) {
      folderData =
        typeof body.folder === 'object' ? body.folder : { id: body.folder };
    }

    // Process file upload
    const processedFile = await this.fileManagementService.processFileUpload({
      filename: file.originalname,
      mimetype: file.mimetype,
      buffer: file.buffer,
      size: file.size,
      folder: folderData,
      title: body.title || file.originalname,
      description: body.description || null,
    });

    // Save to database with rollback on failure
    try {
      const fileRepo = this.dataSourceService.getRepository('file_definition');
      const savedFile = await fileRepo.save({
        ...processedFile,
        folder: folderData,
        uploaded_by: req.user?.id ? { id: req.user.id } : null,
      });

      return {
        success: true,
        data: savedFile,
        message: 'File uploaded successfully',
      };
    } catch (error) {
      // Rollback physical file creation if DB save fails
      await this.fileManagementService.rollbackFileCreation(processedFile.location);
      throw error;
    }
  }

  /**
   * Get all files with query support using DynamicRepository
   */
  @Get()
  async getFiles(@Query() query: any) {
    // Create context for DynamicRepository
    const context: TDynamicContext = {
      $body: {},
      $errors: {},
      $logs: () => {},
      $helpers: {} as any,
      $params: {},
      $query: query,
      $user: undefined,
      $repos: {},
      $req: {} as any,
      $share: { $logs: [] },
    };

    // Create DynamicRepository instance for file_definition
    const dynamicRepo = new DynamicRepository({
      context,
      tableName: 'file_definition',
      queryEngine: this.queryEngine,
      dataSourceService: this.dataSourceService,
      tableHandlerService: this.tableHandlerService,
      routeCacheService: this.routeCacheService,
      systemProtectionService: this.systemProtectionService,
    });

    await dynamicRepo.init();

    // Use DynamicRepository.find method
    const result = await dynamicRepo.find(query);

    return result;
  }

  /**
   * Update file metadata using DynamicRepository
   */
  @Patch(':id')
  async updateFile(@Param('id') id: string, @Body() body: any) {
    // Get current file data first
    const fileRepo = this.dataSourceService.getRepository('file_definition');
    const currentFile: any = await fileRepo.findOne({ where: { id } });

    if (!currentFile) {
      throw new NotFoundException(`File with ID ${id} not found`);
    }

    // Handle folder change - move physical file if needed
    let rollbackInfo = null;
    if (body.folder && body.folder !== currentFile.folder) {
      // Normalize folder to object format
      const newFolder =
        typeof body.folder === 'object' ? body.folder : { id: body.folder };

      // Only move if folder actually changed
      if (newFolder.id !== currentFile.folder?.id) {
        const oldLocation = currentFile.location;
        const folderPath = await this.fileManagementService.getFolderPath(
          newFolder.id,
        );
        const newLocation = this.fileManagementService.getFilePath(
          currentFile.filename_disk,
          folderPath,
        );

        // Move physical file and store rollback info
        rollbackInfo = await this.fileManagementService.movePhysicalFile(
          oldLocation,
          newLocation,
        );

        // Update location in body for database update
        body.location = newLocation;
      }

      // Ensure folder is in object format for database
      body.folder = newFolder;
    }

    // Create context for DynamicRepository
    const context: TDynamicContext = {
      $body: body,
      $errors: {},
      $logs: () => {},
      $helpers: {} as any,
      $params: { id },
      $query: {},
      $user: undefined,
      $repos: {},
      $req: {} as any,
      $share: { $logs: [] },
    };

    // Create DynamicRepository instance for file_definition
    const dynamicRepo = new DynamicRepository({
      context,
      tableName: 'file_definition',
      queryEngine: this.queryEngine,
      dataSourceService: this.dataSourceService,
      tableHandlerService: this.tableHandlerService,
      routeCacheService: this.routeCacheService,
      systemProtectionService: this.systemProtectionService,
    });

    await dynamicRepo.init();

    // Use DynamicRepository.update method with rollback on failure
    try {
      const result = await dynamicRepo.update(id, body);

      return {
        success: true,
        data: result,
        message: 'File updated successfully',
      };
    } catch (error) {
      // Rollback physical file move if DB update fails
      if (rollbackInfo && body.location) {
        await this.fileManagementService.rollbackFileMove(rollbackInfo, body.location);
      }
      throw error;
    }
  }

  /**
   * Delete file
   */
  @Delete(':id')
  async deleteFile(@Param('id') id: string) {
    const fileRepo = this.dataSourceService.getRepository('file_definition');
    const file: any = await fileRepo.findOne({ where: { id } });

    if (!file) {
      throw new NotFoundException(`File with ID ${id} not found`);
    }

    const filePath = file.location;

    // Delete from database first
    await fileRepo.delete(id);

    // Delete physical file (with error handling but don't rollback DB)
    try {
      await this.fileManagementService.deletePhysicalFile(filePath);
    } catch (error) {
      // Log error but don't fail the request - file already deleted from DB
      console.error(`Failed to delete physical file ${filePath}:`, error);
    }

    return {
      success: true,
      message: 'File deleted successfully',
    };
  }
}
