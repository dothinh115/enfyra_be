import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { DataSourceService } from '../../../core/database/data-source/data-source.service';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { 
  FileUploadDto, 
  ProcessedFileInfo, 
  RollbackInfo 
} from '../../../shared/interfaces/file-management.interface';

@Injectable()
export class FileManagementService {
  private readonly basePath = path.join(process.cwd(), 'public'); // Upload to /public
  private readonly logger = new Logger(FileManagementService.name);
  
  constructor(private dataSourceService: DataSourceService) {
    this.ensurePublicDirExists();
  }

  /**
   * Ensure public directory exists
   */
  private async ensurePublicDirExists(): Promise<void> {
    try {
      await fs.promises.mkdir(this.basePath, { recursive: true });
    } catch (error) {
      this.logger.error('Failed to create public directory', error);
    }
  }

  /**
   * Generate unique filename to avoid conflicts
   */
  private generateUniqueFilename(originalFilename: string): string {
    const ext = path.extname(originalFilename);
    const baseName = path.basename(originalFilename, ext);
    const timestamp = Date.now();
    const randomString = crypto.randomBytes(6).toString('hex');
    return `${baseName}_${timestamp}_${randomString}${ext}`;
  }

  /**
   * Determine file type from mimetype
   */
  private getFileType(mimetype: string): string {
    if (mimetype.startsWith('image/')) return 'image';
    if (mimetype.startsWith('video/')) return 'video';
    if (mimetype.startsWith('audio/')) return 'audio';
    if (mimetype.includes('pdf') || mimetype.includes('document') || mimetype.includes('text')) return 'document';
    if (mimetype.includes('zip') || mimetype.includes('tar') || mimetype.includes('gzip')) return 'archive';
    return 'other';
  }

  /**
   * Get folder path from database
   */
  async getFolderPath(folderId: any): Promise<string | null> {
    if (!folderId) return null;
    
    try {
      const folderRepo = this.dataSourceService.getRepository('folder_definition');
      const folder = await folderRepo.findOne({ 
        where: { id: typeof folderId === 'object' ? folderId.id : folderId } 
      });
      
      return (folder as any)?.path || null;
    } catch (error) {
      this.logger.error('Failed to get folder path', error);
      return null;
    }
  }

  /**
   * Get physical path for file storage
   */
  getFilePath(filename: string, folderPath?: string): string {
    if (folderPath) {
      const relativePath = folderPath.startsWith('/') ? folderPath.slice(1) : folderPath;
      return path.join(this.basePath, relativePath, filename);
    }
    return path.join(this.basePath, filename);
  }

  /**
   * Process uploaded file - called by DynamicRepository
   */
  async processFileUpload(fileData: FileUploadDto): Promise<ProcessedFileInfo> {
    const uniqueFilename = this.generateUniqueFilename(fileData.filename);
    
    // Get folder path from database if folder is specified
    const folderPath = await this.getFolderPath(fileData.folder);
    const filePath = this.getFilePath(uniqueFilename, folderPath);
    const fileType = this.getFileType(fileData.mimetype);
    
    this.logger.log(`📁 Processing file upload: ${fileData.filename} → ${uniqueFilename}`);
    if (folderPath) {
      this.logger.log(`📂 Upload path: ${folderPath}`);
    } else {
      this.logger.log(`📂 Upload to root /public`);
    }
    
    try {
      // Ensure directory exists
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      
      // Write file to disk
      await fs.promises.writeFile(filePath, fileData.buffer);
      
      const processedInfo: ProcessedFileInfo = {
        filename: fileData.filename,
        filename_disk: uniqueFilename,
        mimetype: fileData.mimetype,
        type: fileType,
        filesize: fileData.size,
        storage: 'local',
        location: filePath,
        title: fileData.title || fileData.filename,
        description: fileData.description,
        status: 'active'
      };
      
      this.logger.log(`✅ File processed successfully: ${uniqueFilename}`);
      return processedInfo;
      
    } catch (error) {
      this.logger.error(`❌ Failed to process file upload: ${fileData.filename}`, error);
      throw new BadRequestException(`Failed to process file upload: ${error.message}`);
    }
  }

  /**
   * Delete physical file - called by DynamicRepository
   */
  async deletePhysicalFile(location: string): Promise<void> {
    this.logger.log(`🗑️ Deleting physical file: ${location}`);
    
    try {
      if (await this.fileExists(location)) {
        await fs.promises.unlink(location);
        this.logger.log(`✅ Physical file deleted: ${location}`);
      }
    } catch (error) {
      this.logger.error(`❌ Failed to delete physical file: ${location}`, error);
      throw new BadRequestException(`Failed to delete physical file: ${error.message}`);
    }
  }

  /**
   * Move physical file to new location
   */
  async movePhysicalFile(oldLocation: string, newLocation: string): Promise<RollbackInfo | null> {
    if (oldLocation === newLocation) return null;
    
    this.logger.log(`📁 Moving physical file: ${oldLocation} → ${newLocation}`);
    
    try {
      // Ensure destination directory exists
      await fs.promises.mkdir(path.dirname(newLocation), { recursive: true });
      
      if (await this.fileExists(oldLocation)) {
        await fs.promises.rename(oldLocation, newLocation);
        this.logger.log(`✅ Physical file moved: ${oldLocation} → ${newLocation}`);
        
        return {
          filePath: oldLocation,
          fileCreated: false
        };
      }
    } catch (error) {
      this.logger.error(`❌ Failed to move physical file:`, error);
      throw new BadRequestException(`Failed to move physical file: ${error.message}`);
    }
    
    return null;
  }

  /**
   * Rollback file creation when DB operations fail
   */
  async rollbackFileCreation(location: string): Promise<void> {
    try {
      if (await this.fileExists(location)) {
        await fs.promises.unlink(location);
        this.logger.log(`🔄 Rolled back file creation: ${location}`);
      }
    } catch (error) {
      this.logger.error(`❌ Failed to rollback file creation:`, error);
    }
  }

  /**
   * Rollback file move when DB operations fail
   */
  async rollbackFileMove(rollbackInfo: RollbackInfo, newLocation: string): Promise<void> {
    if (!rollbackInfo?.filePath) return;
    
    try {
      if (await this.fileExists(newLocation)) {
        await fs.promises.rename(newLocation, rollbackInfo.filePath);
        this.logger.log(`🔄 Rolled back file move: ${newLocation} → ${rollbackInfo.filePath}`);
      }
    } catch (error) {
      this.logger.error(`❌ Failed to rollback file move:`, error);
    }
  }

  /**
   * Check if file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      const stats = await fs.promises.stat(filePath);
      return stats.isFile();
    } catch {
      return false;
    }
  }

  /**
   * Get file stats
   */
  async getFileStats(location: string): Promise<fs.Stats | null> {
    try {
      return await fs.promises.stat(location);
    } catch {
      return null;
    }
  }


  /**
   * Generate download URL for file
   */
  generateFileUrl(filename_disk: string, folderPath?: string): string {
    const baseUrl = '/uploads';
    if (folderPath) {
      const cleanPath = folderPath.startsWith('/') ? folderPath.slice(1) : folderPath;
      return `${baseUrl}/${cleanPath}/${filename_disk}`;
    }
    return `${baseUrl}/${filename_disk}`;
  }
}