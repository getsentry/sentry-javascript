import type { Attachment } from '@sentry/types';

export type FeedbackFormData = {
  name: string;
  email: string;
  message: string;
  attachments: Attachment[] | undefined;
};
