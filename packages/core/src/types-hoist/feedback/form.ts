import type { Attachment } from '../attachment';

export type FeedbackFormData = {
  name: string;
  email: string;
  message: string;
  attachments: Attachment[] | undefined;
};
