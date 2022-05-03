export type AttachmentOptions = Attachment | AttachmentFromPath;

export interface Attachment {
  data: string | Uint8Array;
  filename: string;
  contentType?: string;
  attachmentType?: string;
}

interface AttachmentFromPath {
  path: string;
  filename?: string;
  contentType?: string;
  attachmentType?: string;
}
