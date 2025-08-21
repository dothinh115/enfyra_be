export interface FileUploadDto {
  filename: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
  folder?: any;  // Can be ID or object {id: ...}
  title?: string;
  description?: string;
}

export interface ProcessedFileInfo {
  filename: string;
  filename_disk: string;
  mimetype: string;
  type: string;
  filesize: number;
  storage: string;
  location: string;
  title?: string;
  description?: string;
  status: 'active' | 'archived' | 'quarantine';
}

export interface RollbackInfo {
  filePath: string;
  fileCreated: boolean;
}

export interface UploadedFileInfo {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
  fieldname: string;
}