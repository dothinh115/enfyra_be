import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Req,
  Body,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { FileManagementService } from '../services/file-management.service';
import { DataSourceService } from '../../../core/database/data-source/data-source.service';
import { RequestWithRouteData } from '../../../shared/interfaces/dynamic-context.interface';

@Controller('file_definition')
export class FileController {
  constructor(
    private fileManagementService: FileManagementService,
    private dataSourceService: DataSourceService,
  ) {}

  /**
   * Upload a new file
   */
  @Post()
  async uploadFile(@Body() body: any, @Req() req: RequestWithRouteData) {
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

      return savedFile;
    } catch (error) {
      // Rollback physical file creation if DB save fails
      await this.fileManagementService.rollbackFileCreation(
        processedFile.location,
      );
      throw error;
    }
  }

  /**
   * Get all files with query support using existing DynamicRepository
   */
  @Get()
  async getFiles(@Req() req: RequestWithRouteData) {
    // Use existing DynamicRepository from context (already initialized with prehook modifications)
    const fileRepo =
      req.routeData?.context?.$repos?.main ||
      req.routeData?.context?.$repos?.file_definition;

    if (!fileRepo) {
      throw new BadRequestException('Repository not found in context');
    }

    // Use existing repo to find files
    const result = await fileRepo.find();

    return result;
  }

  /**
   * Update file metadata using existing DynamicRepository
   */
  @Patch(':id')
  async updateFile(
    @Param('id') id: string,
    @Body() body: any,
    @Req() req: RequestWithRouteData,
  ) {
    // Use existing DynamicRepository from context
    const fileRepo =
      req.routeData?.context?.$repos?.main ||
      req.routeData?.context?.$repos?.file_definition;

    if (!fileRepo) {
      throw new BadRequestException('Repository not found in context');
    }

    // Get current file data first
    const currentFiles = await fileRepo.find({ where: { id } });
    const currentFile = currentFiles.data?.[0];

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

    // Use existing repo to update file with rollback on failure
    try {
      const result = await fileRepo.update(id, body);

      return result;
    } catch (error) {
      // Rollback physical file move if DB update fails
      if (rollbackInfo && body.location) {
        await this.fileManagementService.rollbackFileMove(
          rollbackInfo,
          body.location,
        );
      }
      throw error;
    }
  }

  /**
   * Delete file using existing DynamicRepository
   */
  @Delete(':id')
  async deleteFile(@Param('id') id: string, @Req() req: RequestWithRouteData) {
    // Use existing DynamicRepository from context
    const fileRepo =
      req.routeData?.context?.$repos?.main ||
      req.routeData?.context?.$repos?.file_definition;

    if (!fileRepo) {
      throw new BadRequestException('Repository not found in context');
    }

    // Get file data before deletion
    const files = await fileRepo.find({ where: { id } });
    const file = files.data?.[0];

    if (!file) {
      throw new NotFoundException(`File with ID ${id} not found`);
    }

    const filePath = file.location;

    // Delete from database using existing repo
    const result = await fileRepo.delete(id);

    // Delete physical file (with error handling but don't rollback DB)
    try {
      await this.fileManagementService.deletePhysicalFile(filePath);
    } catch (error) {
      // Log error but don't fail the request - file already deleted from DB
      console.error(`Failed to delete physical file ${filePath}:`, error);
    }

    return result;
  }
}
