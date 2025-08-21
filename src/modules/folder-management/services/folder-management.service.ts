import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { DataSourceService } from '../../../core/database/data-source/data-source.service';
import { DynamicRepository } from '../../dynamic-api/repositories/dynamic.repository';
import * as fs from 'fs';
import * as path from 'path';

interface PhysicalFolderDto {
  path: string;
  slug: string;
  name: string;
}

interface RollbackInfo {
  oldPhysicalPath: string;
  newPhysicalPath: string;
  folderMoved: boolean;
}

@Injectable()
export class FolderManagementService {
  private readonly publicPath = path.join(process.cwd(), 'public');
  private readonly logger = new Logger(FolderManagementService.name);
  
  constructor(private dataSourceService: DataSourceService) {}


  /**
   * Convert logical path to physical path
   * @param logicalPath - Virtual path like /documents/subfolder
   * @returns Physical path like /project/public/documents/subfolder
   */
  getPhysicalPath(logicalPath: string): string {
    const relativePath = logicalPath.startsWith('/') ? logicalPath.slice(1) : logicalPath;
    return path.join(this.publicPath, relativePath);
  }

  /**
   * Rollback physical folder creation when DB operations fail
   * Chỉ xóa folder vừa tạo nếu DB operation fail
   */
  async rollbackFolderCreation(folderPath: string): Promise<void> {
    const physicalPath = this.getPhysicalPath(folderPath);
    
    try {
      if (await this.directoryExists(physicalPath)) {
        if (await this.isDirectoryEmpty(physicalPath)) {
          await fs.promises.rmdir(physicalPath);
          this.logger.log(`🔄 Rolled back folder creation: ${physicalPath}`);
        } else {
          this.logger.warn(`⚠️ Cannot rollback non-empty folder: ${physicalPath}`);
        }
      }
    } catch (error) {
      this.logger.error(`❌ Failed to rollback folder creation:`, error);
    }
  }

  /**
   * Rollback physical folder move when DB operations fail
   * Di chuyển folder về vị trí cũ
   */
  async rollbackFolderMove(rollbackInfo: RollbackInfo): Promise<void> {
    if (!rollbackInfo?.folderMoved) return;
    
    try {
      if (await this.directoryExists(rollbackInfo.newPhysicalPath)) {
        await fs.promises.rename(rollbackInfo.newPhysicalPath, rollbackInfo.oldPhysicalPath);
        this.logger.log(`🔄 Rolled back folder move: ${rollbackInfo.newPhysicalPath} → ${rollbackInfo.oldPhysicalPath}`);
      }
    } catch (error) {
      this.logger.error(`❌ Failed to rollback folder move:`, error);
    }
  }

  /**
   * Check if directory exists
   */
  private async directoryExists(dirPath: string): Promise<boolean> {
    try {
      const stats = await fs.promises.stat(dirPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Check if directory is empty
   */
  private async isDirectoryEmpty(dirPath: string): Promise<boolean> {
    try {
      const contents = await fs.promises.readdir(dirPath);
      return contents.length === 0;
    } catch {
      return true;
    }
  }

  /**
   * Create physical folder - called by DynamicRepository
   * Dynamic repo đã handle validation, chỉ tạo folder thực
   */
  async createPhysicalFolder(folderData: { path: string; name: string }): Promise<void> {
    const physicalPath = this.getPhysicalPath(folderData.path);
    
    this.logger.log(`📁 Creating physical folder: ${folderData.name} at ${physicalPath}`);
    
    try {
      await fs.promises.mkdir(physicalPath, { recursive: true });
      this.logger.log(`✅ Physical folder created: ${physicalPath}`);
    } catch (error) {
      this.logger.error(`❌ Failed to create physical folder: ${physicalPath}`, error);
      throw new BadRequestException(`Failed to create physical folder: ${error.message}`);
    }
  }

  /**
   * Move/rename physical folder - called by DynamicRepository
   * Dynamic repo đã handle validation
   */
  async movePhysicalFolder(oldPath: string, newPath: string): Promise<RollbackInfo | null> {
    const oldPhysicalPath = this.getPhysicalPath(oldPath);
    const newPhysicalPath = this.getPhysicalPath(newPath);
    
    // Nếu path không đổi thì không cần move
    if (oldPath === newPath) {
      return null;
    }
    
    this.logger.log(`📁 Moving physical folder: ${oldPhysicalPath} → ${newPhysicalPath}`);
    
    try {
      // Tạo parent directory nếu cần
      await fs.promises.mkdir(path.dirname(newPhysicalPath), { recursive: true });
      
      if (await this.directoryExists(oldPhysicalPath)) {
        await fs.promises.rename(oldPhysicalPath, newPhysicalPath);
        this.logger.log(`✅ Physical folder moved: ${oldPhysicalPath} → ${newPhysicalPath}`);
        
        return {
          oldPhysicalPath,
          newPhysicalPath,
          folderMoved: true
        };
      } else {
        // Tạo folder mới nếu cũ không tồn tại
        await fs.promises.mkdir(newPhysicalPath, { recursive: true });
        this.logger.log(`✅ Physical folder created: ${newPhysicalPath}`);
        return null;
      }
    } catch (error) {
      this.logger.error(`❌ Failed to move physical folder:`, error);
      throw new BadRequestException(`Failed to move physical folder: ${error.message}`);
    }
  }

  /**
   * Delete physical folder - called by DynamicRepository
   * Dynamic repo đã handle validation
   */
  async deletePhysicalFolder(folderPath: string): Promise<void> {
    const physicalPath = this.getPhysicalPath(folderPath);
    
    this.logger.log(`📁 Deleting physical folder: ${physicalPath}`);
    
    // Kiểm tra folder có rỗng không trước khi xóa
    if (await this.directoryExists(physicalPath)) {
      if (!(await this.isDirectoryEmpty(physicalPath))) {
        throw new BadRequestException('Cannot delete folder that contains files or subfolders');
      }
      
      try {
        await fs.promises.rmdir(physicalPath);
        this.logger.log(`✅ Physical folder removed: ${physicalPath}`);
      } catch (error) {
        this.logger.error(`❌ Failed to remove physical folder: ${physicalPath}`, error);
        throw new BadRequestException(`Failed to remove physical folder: ${error.message}`);
      }
    }
  }

  /**
   * Rollback folder deletion - recreate deleted folder when DB delete fails
   */
  async rollbackFolderDeletion(folderPath: string): Promise<void> {
    const physicalPath = this.getPhysicalPath(folderPath);
    
    try {
      await fs.promises.mkdir(physicalPath, { recursive: true });
      this.logger.log(`🔄 Rolled back folder deletion: ${physicalPath}`);
    } catch (error) {
      this.logger.error(`❌ Failed to rollback folder deletion: ${physicalPath}`, error);
    }
  }
}