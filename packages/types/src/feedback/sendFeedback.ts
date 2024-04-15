import type { Attachment } from '../attachment';
import type { Event } from '../event';
import type { TransportMakeRequestResponse } from '../transport';
import type { User } from '../user';

/**
 * Crash report feedback object
 */
export interface UserFeedback {
  event_id: string;
  email: User['email'];
  name: string;
  comments: string;
}

interface FeedbackContext extends Record<string, unknown> {
  message: string;
  contact_email?: string;
  name?: string;
  replay_id?: string;
  url?: string;
}

/**
 * NOTE: These types are still considered Alpha and subject to change.
 * @hidden
 */
export interface FeedbackEvent extends Event {
  type: 'feedback';
  contexts: Event['contexts'] & {
    feedback: FeedbackContext;
  };
}

export interface SendFeedbackParams {
  message: string;
  name?: string;
  email?: string;
  attachments?: Attachment[];
  url?: string;
  source?: string;
}

interface SendFeedbackOptions {
  /**
   * Should include replay with the feedback?
   */
  includeReplay?: boolean;
}

export type SendFeedback = (
  params: SendFeedbackParams,
  options?: SendFeedbackOptions,
) => Promise<TransportMakeRequestResponse>;
