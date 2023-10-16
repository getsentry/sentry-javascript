import type { Event, Primitive } from '@sentry/types';

export type SentryTags = { [key: string]: Primitive } | undefined;

/**
 * NOTE: These types are still considered Beta and subject to change.
 * @hidden
 */
export interface FeedbackEvent extends Event {
  feedback: {
    message: string;
    url: string;
    contact_email?: string;
    name?: string;
    replay_id?: string;
  };
  // TODO: Add this event type to Event
  // type: 'feedback_event';
}

export interface SendFeedbackData {
  feedback: {
    message: string;
    url: string;
    email?: string;
    replay_id?: string;
    name?: string;
  };
}
