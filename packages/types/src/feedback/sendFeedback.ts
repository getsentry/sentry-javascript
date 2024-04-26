import type { Event, EventHint } from '../event';
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
  associated_event_id?: string;
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
  url?: string;
  source?: string;
  associatedEventId?: string;
}

interface SendFeedbackOptions extends EventHint {
  /**
   * Should include replay with the feedback?
   */
  includeReplay?: boolean;
}

export type SendFeedback = (params: SendFeedbackParams, options?: SendFeedbackOptions) => Promise<string>;
