import { Injectable, NestMiddleware, BadRequestException } from '@nestjs/common';
import { Response, NextFunction } from 'express';
import * as multer from 'multer';
import { RequestWithRouteData } from '../interfaces/dynamic-context.interface';

@Injectable()
export class FileUploadMiddleware implements NestMiddleware {
  private upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: (req, file, cb) => {
      // Allow all file types for now, can be restricted later
      cb(null, true);
    },
  });

  use(req: RequestWithRouteData, res: Response, next: NextFunction) {
    const actualPath = req.originalUrl || req.url;
    const isFileDefinitionRoute = actualPath.includes('/file_definition');
    const isPostOrPatch = ['POST', 'PATCH'].includes(req.method);
    const isMultipartContent = req.headers['content-type']?.includes('multipart/form-data');
    
    console.log('🔍 FileUploadMiddleware Debug:', {
      actualPath,
      method: req.method,
      contentType: req.headers['content-type'],
      isFileDefinitionRoute,
      isPostOrPatch,
      isMultipartContent,
      willProcess: isFileDefinitionRoute && isPostOrPatch && isMultipartContent
    });
    
    // Skip if not file_definition route, not POST/PATCH, or not multipart content
    if (!isFileDefinitionRoute || !isPostOrPatch || !isMultipartContent) {
      console.log('🔍 Skipping FileUploadMiddleware');
      return next();
    }

    // Use multer to parse multipart form data
    this.upload.single('file')(req, res, (error: any) => {
      if (error) {
        if (error instanceof multer.MulterError) {
          if (error.code === 'LIMIT_FILE_SIZE') {
            throw new BadRequestException('File size exceeds limit of 10MB');
          }
          throw new BadRequestException(`File upload error: ${error.message}`);
        }
        throw new BadRequestException(`Unexpected error: ${error.message}`);
      }

      // For POST method, require file upload
      if (req.method === 'POST' && !req.file) {
        throw new BadRequestException('No file provided for upload');
      }

      // Handle form data processing for both dynamic routes and static controllers
      if (req.routeData?.context) {
        // Dynamic route - process body for context
        const processedBody: any = {};
        
        if (req.body.folder) {
          processedBody.folder = typeof req.body.folder === 'object' 
            ? req.body.folder 
            : { id: req.body.folder };
        }
        
        req.routeData.context.$body = { ...req.routeData.context.$body, ...processedBody };

        // Add uploaded file to context
        if (req.file) {
          req.routeData.context.$uploadedFile = {
            originalname: req.file.originalname,
            mimetype: req.file.mimetype,
            buffer: req.file.buffer,
            size: req.file.size,
            fieldname: req.file.fieldname,
          };
        }
      }
      // For static controller, multer already added file to req.file and body to req.body

      next();
    });
  }
}