export interface Attachment {
  path?: string;
  data?: string | Uint8Array;
  filename?: string;
  contentType?: string;
  attachmentType?: string;
}
