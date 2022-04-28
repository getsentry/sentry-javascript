import { Attachment, AttachmentItem } from '@sentry/types';

/** */
export function createAttachmentEnvelopeItem(attachment: Attachment): AttachmentItem {
  const [pathOrData, options] = attachment;

  const buffer = typeof pathOrData === 'string' ? new TextEncoder().encode(pathOrData) : pathOrData;

  return [
    {
      type: 'attachment',
      length: buffer.length,
      filename: options?.filename || 'No filename',
      content_type: options?.contentType,
      attachment_type: options?.attachmentType,
    },
    buffer,
  ];
}
