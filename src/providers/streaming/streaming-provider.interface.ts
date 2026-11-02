export interface ProvisionStreamParams {
  roomId: string;
  creatorId: string;
  isPrivate: boolean;
}

export interface StreamCredentialsResult {
  streamKey: string;
  streamKeyHash: string;
  ingestServerUrl: string;
  playbackUrl: string;
  expiresAt?: Date;
}

export interface PlaybackAccessParams {
  roomId: string;
  viewerId?: string;
  isAuthorizedPrivateViewer?: boolean;
}

export interface PlaybackAccessResult {
  playbackUrl: string;
  isAllowed: boolean;
  token?: string;
  expiresAt: Date;
}

export interface StreamingProvider {
  provisionStream(params: ProvisionStreamParams): Promise<StreamCredentialsResult>;
  revokeStreamCredentials(streamKeyHash: string): Promise<boolean>;
  getPlaybackAccess(params: PlaybackAccessParams): Promise<PlaybackAccessResult>;
  verifyStreamWebhook(headers: Record<string, any>, payload: any): boolean;
  endStream(roomId: string): Promise<boolean>;
}
