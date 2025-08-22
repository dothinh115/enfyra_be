import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { DataSourceService } from '../../../core/database/data-source/data-source.service';
import {
  FileUploadDto,
  ProcessedFileInfo,
} from '../../../shared/interfaces/file-management.interface';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { autoSlug } from '../../../shared/utils/auto-slug.helper';

@Injectable()
export class FileManagementService {
  private readonly basePath = path.join(process.cwd(), 'public');
  private readonly logger = new Logger(FileManagementService.name);

  constructor(private dataSourceService: DataSourceService) {
    this.ensurePublicDirExists();
  }

  private async ensurePublicDirExists(): Promise<void> {
    try {
      await fs.promises.mkdir(this.basePath, { recursive: true });
    } catch (error) {
      this.logger.error('Failed to create public directory', error);
    }
  }

  private generateUniqueFilename(originalFilename: string): string {
    const ext = path.extname(originalFilename);
    const baseName = path.basename(originalFilename, ext);
    const sanitizedName = autoSlug(baseName, {
      separator: '_',
      lowercase: false,
      maxLength: 50,
    });
    const timestamp = Date.now();
    const randomString = crypto.randomBytes(6).toString('hex');
    return `${sanitizedName}_${timestamp}_${randomString}${ext}`;
  }

  private getFileType(mimetype: string): string {
    if (mimetype.startsWith('image/')) return 'image';
    if (mimetype.startsWith('video/')) return 'video';
    if (mimetype.startsWith('audio/')) return 'audio';
    if (
      mimetype.includes('pdf') ||
      mimetype.includes('document') ||
      mimetype.includes('text')
    )
      return 'document';
    if (
      mimetype.includes('zip') ||
      mimetype.includes('tar') ||
      mimetype.includes('gzip')
    )
      return 'archive';
    return 'other';
  }

  getFilePath(filename: string): string {
    return path.join(this.basePath, 'uploads', filename);
  }

  async processFileUpload(fileData: FileUploadDto): Promise<ProcessedFileInfo> {
    const uniqueFilename = this.generateUniqueFilename(fileData.filename);
    const filePath = this.getFilePath(uniqueFilename);
    const fileType = this.getFileType(fileData.mimetype);

    this.logger.log(
      `Processing file upload: ${fileData.filename} → ${uniqueFilename}`,
    );

    try {
      await fs.promises.mkdir(path.join(this.basePath, 'uploads'), {
        recursive: true,
      });
      await fs.promises.writeFile(filePath, fileData.buffer);

      const processedInfo: ProcessedFileInfo = {
        filename: fileData.filename,
        filename_disk: uniqueFilename,
        mimetype: fileData.mimetype,
        type: fileType,
        filesize: fileData.size,
        storage: 'local',
        location: `/uploads/${uniqueFilename}`,
        title: fileData.title || fileData.filename,
        description: fileData.description,
        status: 'active',
      };

      this.logger.log(`File processed successfully: ${uniqueFilename}`);
      return processedInfo;
    } catch (error) {
      this.logger.error(
        `Failed to process file upload: ${fileData.filename}`,
        error,
      );
      throw new BadRequestException(
        `Failed to process file upload: ${error.message}`,
      );
    }
  }

  async deletePhysicalFile(location: string): Promise<void> {
    this.logger.log(`Deleting physical file: ${location}`);

    try {
      const absolutePath = this.convertToAbsolutePath(location);

      if (await this.fileExists(absolutePath)) {
        await fs.promises.unlink(absolutePath);
        this.logger.log(`Physical file deleted: ${absolutePath}`);
        return;
      }

      // Try alternative path
      const altPath = path.join(
        process.cwd(),
        'public',
        'uploads',
        path.basename(location),
      );
      if (await this.fileExists(altPath)) {
        await fs.promises.unlink(altPath);
        this.logger.log(
          `Physical file deleted from alternative path: ${altPath}`,
        );
        return;
      }

      this.logger.warn(`Physical file not found: ${location}`);
    } catch (error) {
      this.logger.error(`Failed to delete physical file: ${location}`, error);
      throw new BadRequestException(
        `Failed to delete physical file: ${error.message}`,
      );
    }
  }

  async rollbackFileCreation(location: string): Promise<void> {
    try {
      const absolutePath = this.convertToAbsolutePath(location);
      if (await this.fileExists(absolutePath)) {
        await fs.promises.unlink(absolutePath);
        this.logger.log(`Rolled back file creation: ${absolutePath}`);
      }
    } catch (error) {
      this.logger.error(`Failed to rollback file creation:`, error);
    }
  }

  private convertToAbsolutePath(location: string): string {
    return location.startsWith('/')
      ? path.join(process.cwd(), 'public', location.slice(1))
      : path.join(process.cwd(), 'public', location);
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      const stats = await fs.promises.stat(filePath);
      return stats.isFile();
    } catch {
      return false;
    }
  }
}
