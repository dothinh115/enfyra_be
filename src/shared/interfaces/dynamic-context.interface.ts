import { Request } from 'express';
import { UploadedFileInfo } from './file-management.interface';

export interface TDynamicContext {
  $body: any;
  $errors: any;
  $logs: (...args: any[]) => void;
  $helpers: {
    $jwt: (payload: any, exp: string) => string;
    $bcrypt: {
      hash: (plain: string) => Promise<string>;
      compare: (p: string, h: string) => Promise<boolean>;
    };
    autoSlug: (text: string) => string;
  };
  $params: any;
  $query: any;
  $user: any;
  $repos: Record<string, any>;
  $req: Request;
  $share: {
    $logs: any[];
  };
  $uploadedFile?: UploadedFileInfo;
}

export interface RequestWithRouteData extends Request {
  routeData?: {
    context: TDynamicContext;
    params: any;
    handler: string;
    hooks: any[];
    isPublished: boolean;
    mainTable?: any;
    targetTables?: any[];
    route?: any;
  };
  user?: any;
  file?: any; // Multer file object
}