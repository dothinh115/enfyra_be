import {
  Injectable,
  NestMiddleware,
  BadRequestException,
} from '@nestjs/common';
import { Response, NextFunction } from 'express';
import * as multer from 'multer';
import { RequestWithRouteData } from '../interfaces/dynamic-context.interface';

@Injectable()
export class FileUploadMiddleware implements NestMiddleware {
  private upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 10 * 1024 * 1024,
    },
    fileFilter: (req, file, cb) => {
      cb(null, true);
    },
    preservePath: true,
    encoding: 'utf8',
  });

  use(req: RequestWithRouteData, res: Response, next: NextFunction) {
    const actualPath = req.originalUrl || req.url;
    const isFileDefinitionRoute = actualPath.includes('/file_definition');
    const isPostOrPatch = ['POST', 'PATCH'].includes(req.method);
    const isMultipartContent = req.headers['content-type']?.includes(
      'multipart/form-data',
    );

    if (!isFileDefinitionRoute || !isPostOrPatch || !isMultipartContent) {
      return next();
    }

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

      if (req.method === 'POST' && !req.file) {
        throw new BadRequestException('No file provided for upload');
      }

      if (req.file && req.file.originalname) {
        try {
          let fixedName = req.file.originalname;

          if (this.detectEncodingCorruption(fixedName)) {
            const utf8Fixed = Buffer.from(fixedName, 'latin1').toString('utf8');
            if (this.isValidVietnameseString(utf8Fixed)) {
              fixedName = utf8Fixed;
            }
          }

          fixedName = this.fixCharacterCorruptions(fixedName);
          req.file.originalname = fixedName;
        } catch (error) {
          console.warn('Failed to fix filename encoding:', error);
        }
      }

      if (req.routeData?.context) {
        const processedBody: any = {};

        if (req.body.folder) {
          processedBody.folder =
            typeof req.body.folder === 'object'
              ? req.body.folder
              : { id: req.body.folder };
        }

        req.routeData.context.$body = {
          ...req.routeData.context.$body,
          ...processedBody,
        };

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

      next();
    });
  }

  private detectEncodingCorruption(str: string): boolean {
    const corruptionPatterns = [/áº/, /Ã/, /[^\x00-\x7F]/];
    return corruptionPatterns.some((pattern) => pattern.test(str));
  }

  private isValidVietnameseString(str: string): boolean {
    const vietnameseRanges = [
      /[àáảãạăằắẳẵặâầấẩẫậ]/,
      /[èéẻẽẹêềếểễệ]/,
      /[ìíỉĩị]/,
      /[òóỏõọôồốổỗộơờớởỡợ]/,
      /[ùúủũụưừứửữự]/,
      /[ỳýỷỹỵ]/,
      /[đĐ]/,
    ];
    return vietnameseRanges.some((range) => range.test(str));
  }

  private fixCharacterCorruptions(str: string): string {
    const corruptionPatterns = [
      { pattern: /áº/g, replacement: 'ă' },
      { pattern: /Ã/g, replacement: 'à' },
      { pattern: /kÃ½/g, replacement: 'ký' },
      { pattern: /tá»±/g, replacement: 'tự' },
      { pattern: /Äáº·c/g, replacement: 'đặc' },
      { pattern: /biá»t/g, replacement: 'biệt' },
    ];

    let fixedStr = str;
    corruptionPatterns.forEach(({ pattern, replacement }) => {
      if (pattern.test(fixedStr)) {
        fixedStr = fixedStr.replace(pattern, replacement);
      }
    });

    return fixedStr;
  }
}
