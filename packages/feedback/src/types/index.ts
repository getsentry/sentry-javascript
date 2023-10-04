import type { Event, Primitive } from '@sentry/types';

/**
 * NOTE: These types are still considered Beta and subject to change.
 * @hidden
 */
export interface FeedbackEvent extends Event {
  feedback: {
    contact_email: string;
    message: string;
    replay_id: string | undefined;
    url: string;
  };
  // TODO: Add this event type to Event
  // type: 'feedback_event';
}

export interface SendFeedbackData {
  feedback: {
    message: string;
    email: string;
    replay_id: string | undefined;
    name: string;
    url: string;
  };
  tags: { [key: string]: Primitive } | undefined;
}
