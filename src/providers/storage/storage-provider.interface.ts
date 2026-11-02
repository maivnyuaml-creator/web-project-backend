export interface UploadFileParams {
  key: string;
  buffer: Buffer;
  mimeType: string;
  isProtected?: boolean;
}

export interface StorageProvider {
  uploadFile(params: UploadFileParams): Promise<{ key: string; bucket: string; url: string }>;
  getSignedDownloadUrl(key: string, isProtected: boolean, expiresInSeconds?: number): Promise<string>;
  deleteFile(key: string, isProtected: boolean): Promise<boolean>;
}
