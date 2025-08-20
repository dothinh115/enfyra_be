import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { DataSourceService } from '../../../core/database/data-source/data-source.service';
import { Response } from 'express';
import * as fs from 'fs';

@Injectable()
export class FileAssetsService {
  private readonly logger = new Logger(FileAssetsService.name);

  constructor(private dataSourceService: DataSourceService) {}

  async streamFile(fileId: string, res: Response): Promise<void> {
    try {
      // Query file_definition to get file info
      const fileRepo = this.dataSourceService.getRepository('file_definition');
      const file = await fileRepo.findOne({
        where: { id: fileId },
        relations: ['folder'],
      });

      if (!file) {
        throw new NotFoundException(`File with ID ${fileId} not found`);
      }

      const filePath = (file as any).location;

      // Check if physical file exists
      if (!(await this.fileExists(filePath))) {
        this.logger.error(`Physical file not found: ${filePath}`);
        throw new NotFoundException(`Physical file not found`);
      }

      // Get file stats for headers
      const stats = await fs.promises.stat(filePath);
      const filename = (file as any).filename;
      const mimetype = (file as any).mimetype;

      // Set headers
      res.setHeader('Content-Type', mimetype);
      res.setHeader('Content-Length', stats.size);
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);

      // Stream the file
      const fileStream = fs.createReadStream(filePath);

      fileStream.on('error', (error) => {
        this.logger.error(`Error streaming file ${fileId}:`, error);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Error streaming file' });
        }
      });

      fileStream.pipe(res);
    } catch (error) {
      this.logger.error(`Failed to stream file ${fileId}:`, error);

      if (!res.headersSent) {
        if (error instanceof NotFoundException) {
          res.status(404).json({ error: error.message });
        } else {
          res.status(500).json({ error: 'Internal server error' });
        }
      }
    }
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
