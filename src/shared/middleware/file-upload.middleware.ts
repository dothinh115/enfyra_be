import { Injectable, NestMiddleware, BadRequestException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as multer from 'multer';
import { TDynamicContext } from '../utils/types/dynamic-context.type';

interface RequestWithRouteData extends Request {
  routeData?: {
    context: TDynamicContext;
    [key: string]: any;
  };
  file?: {
    originalname: string;
    mimetype: string;
    buffer: Buffer;
    size: number;
    fieldname: string;
  };
}

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
    console.log(`📤 FileUploadMiddleware called - URL: ${req.url}, Method: ${req.method}, originalUrl: ${req.originalUrl}`);
    
    // Check originalUrl for actual path since dynamic routes all have req.url = "/"
    const actualPath = req.originalUrl || req.url;
    const isFileDefinitionRoute = actualPath.includes('/file_definition');
    const isUploadRoute = actualPath.includes('/upload') || req.method === 'POST';
    const isMultipartContent = req.headers['content-type']?.includes('multipart/form-data');
    
    console.log(`📤 actualPath: ${actualPath}`);
    console.log(`📤 isFileDefinitionRoute: ${isFileDefinitionRoute}, isUploadRoute: ${isUploadRoute}, isMultipartContent: ${isMultipartContent}`);
    
    if (!isFileDefinitionRoute || !isUploadRoute || !isMultipartContent) {
      console.log(`📤 Skipping file upload processing`);
      return next();
    }

    console.log(`📤 Processing file upload...`);

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

      // Log context.$body before parsing
      console.log(`🔍 BEFORE parsing - context.$body:`, req.routeData?.context?.$body);
      console.log(`🔍 BEFORE parsing - req.body:`, req.body);

      // Parse form fields to body (multer adds fields to req.body)
      if (req.body && req.routeData?.context) {
        // Process folder field if it exists - parse JSON and extract ID
        const processedBody = { ...req.body };
        if (processedBody.folder) {
          try {
            // Parse the folder JSON string and extract just the ID
            const folderData = JSON.parse(processedBody.folder);
            processedBody.folder = folderData.id || null;
            console.log(`📂 Parsed folder: ${req.body.folder} → ${processedBody.folder}`);
          } catch (error) {
            console.warn(`⚠️ Failed to parse folder field: ${error.message}`);
            processedBody.folder = null;
          }
        }
        
        // Merge form fields into context body
        req.routeData.context.$body = { ...req.routeData.context.$body, ...processedBody };
        console.log(`📝 Form fields parsed:`, req.body);
        console.log(`📝 AFTER parsing - Final context.$body:`, req.routeData.context.$body);
      } else {
        console.log(`⚠️ req.body:`, req.body);
        console.log(`⚠️ req.routeData:`, req.routeData ? 'EXISTS' : 'MISSING');
        console.log(`⚠️ context exists:`, req.routeData?.context ? 'YES' : 'NO');
      }

      // If file was uploaded, add it to routeData.context
      if (req.file) {
        // Ensure routeData and context exist
        if (!req.routeData?.context) {
          console.warn('⚠️ routeData.context not found, skipping file upload processing');
          return next();
        }

        // Add uploaded file to existing context
        req.routeData.context.$uploadedFile = {
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          buffer: req.file.buffer,
          size: req.file.size,
          fieldname: req.file.fieldname,
        };

        console.log(`📁 File detected: ${req.file.originalname} (${req.file.size} bytes, ${req.file.mimetype})`);
      } else if (isUploadRoute) {
        // If this is an upload route but no file was provided
        throw new BadRequestException('No file provided for upload');
      }

      next();
    });
  }
}