export type Attachment = AttachmentWithPath | AttachmentWithData;

export interface AttachmentWithData {
  data: string | Uint8Array;
  filename: string;
  contentType?: string;
  attachmentType?: string;
}

interface AttachmentWithPath {
  path: string;
  filename?: string;
  contentType?: string;
  attachmentType?: string;
}
