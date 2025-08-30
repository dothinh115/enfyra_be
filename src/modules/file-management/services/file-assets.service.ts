import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import {
  AuthenticationException,
  AuthorizationException,
} from '../../../core/exceptions/custom-exceptions';
import { DataSourceService } from '../../../core/database/data-source/data-source.service';
import { FileManagementService } from './file-management.service';
import { Response } from 'express';
import { RequestWithRouteData } from '../../../shared/interfaces/dynamic-context.interface';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';

@Injectable()
export class FileAssetsService {
  private readonly logger = new Logger(FileAssetsService.name);

  constructor(
    private dataSourceService: DataSourceService,
    private fileManagementService: FileManagementService
  ) {}

  async streamFile(req: RequestWithRouteData, res: Response): Promise<void> {
    // Lấy fileId từ request params
    const fileId = req.routeData?.params?.id || req.params.id;

    if (!fileId) {
      res.status(400).json({ error: 'File ID is required' });
      return;
    }

    const fileRepo = this.dataSourceService.getRepository('file_definition');
    const file = await fileRepo.findOne({
      where: { id: fileId },
      relations: [
        'folder',
        'permissions',
        'permissions.allowedUsers',
        'permissions.role',
      ],
    });

    if (!file) {
      throw new NotFoundException(`File with ID ${fileId} not found`);
    }
    // Check permissions
    await this.checkFilePermissions(file, req);

    const location = (file as any).location;
    const filePath = this.fileManagementService.getFilePath(
      path.basename(location)
    );

    if (!(await this.fileExists(filePath))) {
      this.logger.error(`Physical file not found: ${filePath}`);
      throw new NotFoundException(`Physical file not found`);
    }

    const filename = (file as any).filename;
    const mimetype = (file as any).mimetype;
    const fileType = (file as any).type;

    // Kiểm tra nếu là ảnh và có query parameters để xử lý
    if (this.isImageFile(mimetype, fileType) && this.hasImageQueryParams(req)) {
      await this.processImageWithQuery(filePath, req, res, filename);
      return;
    }

    // Xử lý file thông thường
    await this.streamRegularFile(filePath, res, filename, mimetype);
  }

  private isImageFile(mimetype: string, fileType: string): boolean {
    return mimetype.startsWith('image/') || fileType === 'image';
  }

  private hasImageQueryParams(req: RequestWithRouteData): boolean {
    const query = req.routeData?.context?.$query || req.query;
    return !!(query.format || query.width || query.height || query.quality);
  }

  private async processImageWithQuery(
    filePath: string,
    req: RequestWithRouteData,
    res: Response,
    filename: string
  ): Promise<void> {
    try {
      const query = req.routeData?.context?.$query || req.query;

      // Parse query parameters
      const format = query.format as string;
      const width = query.width
        ? parseInt(query.width as string, 10)
        : undefined;
      const height = query.height
        ? parseInt(query.height as string, 10)
        : undefined;
      const quality = query.quality
        ? parseInt(query.quality as string, 10)
        : undefined;
      const cache = query.cache
        ? parseInt(query.cache as string, 10)
        : undefined;

      // Validate parameters
      if (width && (width < 1 || width > 4000)) {
        res.status(400).json({ error: 'Width must be between 1 and 4000' });
        return;
      }
      if (height && (height < 1 || height > 4000)) {
        res.status(400).json({ error: 'Height must be between 1 and 4000' });
        return;
      }
      if (quality && (quality < 1 || quality > 100)) {
        res.status(400).json({ error: 'Quality must be between 1 and 100' });
        return;
      }

      // Xử lý ảnh với Sharp
      let imageProcessor = sharp(filePath);

      // Resize nếu có width hoặc height
      if (width || height) {
        imageProcessor = imageProcessor.resize(width, height, {
          fit: 'inside', // Giữ tỷ lệ khung hình
          withoutEnlargement: true, // Không phóng to ảnh
        });
      }

      // Set format và quality
      if (format) {
        const supportedFormats = ['jpeg', 'jpg', 'png', 'webp', 'avif', 'gif'];
        if (!supportedFormats.includes(format.toLowerCase())) {
          res.status(400).json({
            error: `Unsupported format. Supported formats: ${supportedFormats.join(', ')}`,
          });
          return;
        }

        imageProcessor = this.setImageFormat(
          imageProcessor,
          format.toLowerCase(),
          quality
        );
      } else if (quality) {
        // Nếu chỉ có quality mà không có format, sử dụng format gốc
        const originalFormat = path.extname(filePath).toLowerCase().slice(1);
        imageProcessor = this.setImageFormat(
          imageProcessor,
          originalFormat,
          quality
        );
      }

      // Set headers
      const outputFormat = format || this.getOriginalFormat(filePath);
      const mimeType = this.getMimeType(outputFormat);

      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);

      // Set cache header nếu có query cache
      if (cache && cache > 0) {
        res.setHeader('Cache-Control', `public, max-age=${cache}`);
      }

      // Stream ảnh đã xử lý
      imageProcessor.pipe(res);
    } catch (error) {
      this.logger.error('Error processing image:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error processing image' });
      }
    }
  }

  private setImageFormat(
    imageProcessor: sharp.Sharp,
    format: string,
    quality?: number
  ): sharp.Sharp {
    switch (format) {
      case 'jpeg':
      case 'jpg':
        return imageProcessor.jpeg({ quality: quality || 80 });
      case 'png':
        return imageProcessor.png({ quality: quality || 80 });
      case 'webp':
        return imageProcessor.webp({ quality: quality || 80 });
      case 'avif':
        return imageProcessor.avif({ quality: quality || 80 });
      case 'gif':
        return imageProcessor.gif();
      default:
        return imageProcessor;
    }
  }

  private async streamRegularFile(
    filePath: string,
    res: Response,
    filename: string,
    mimetype: string
  ): Promise<void> {
    const stats = await fs.promises.stat(filePath);

    res.setHeader('Content-Type', mimetype);
    res.setHeader('Content-Length', stats.size);
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);

    const fileStream = fs.createReadStream(filePath);

    fileStream.on('error', error => {
      this.logger.error(`Error streaming file:`, error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error streaming file' });
      }
    });

    fileStream.pipe(res);
  }

  private getOriginalFormat(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase().slice(1);
    if (ext === 'jpg') return 'jpeg';
    return ext;
  }

  private getMimeType(format: string): string {
    const mimeTypes: Record<string, string> = {
      jpeg: 'image/jpeg',
      jpg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      avif: 'image/avif',
      gif: 'image/gif',
    };
    return mimeTypes[format] || 'image/jpeg';
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      const stats = await fs.promises.stat(filePath);
      return stats.isFile();
    } catch {
      return false;
    }
  }

  private async checkFilePermissions(
    file: any,
    req: RequestWithRouteData
  ): Promise<void> {
    // 1. Nếu file.isPublished = true -> bypass permission
    if (file.isPublished === true) {
      this.logger.log('File is published, bypassing permission checks');
      return;
    }

    // 2. Nếu isPublished = false mà chưa login -> 401
    const user = req.routeData?.context?.$user || req.user;
    if (!user?.id) {
      this.logger.log('User not logged in, file not published');
      throw new AuthenticationException(
        'Authentication required to access this file'
      );
    }

    this.logger.log(`Checking permissions for user: ${user.id}`);

    if (user.isRootAdmin === true) {
      this.logger.log('User is root admin, granting access');
      return;
    }

    const filePermissions = file.permissions || [];
    const canPass = filePermissions.find((permission: any) => {
      if (permission.isEnabled === false) return false;

      if (permission.allowedUsers?.id === user.id) {
        this.logger.log(
          `User ${user.id} found in allowedUsers, granting access`
        );
        return true;
      }

      if (permission.role && user.role?.id === permission.role.id) {
        this.logger.log(
          `User ${user.id} has role ${permission.role.name}, granting access`
        );
        return true;
      }

      return false;
    });

    if (!canPass) {
      this.logger.log(`User ${user.id} denied access to file ${file.id}`);
      throw new AuthorizationException('Access denied to this file');
    }
  }
}
