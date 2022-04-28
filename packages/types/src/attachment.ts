export interface AttachmentOptions {
  filename?: string;
  contentType?: string;
  attachmentType?: string;
}

export type Attachment = [string | Uint8Array, AttachmentOptions | undefined];
