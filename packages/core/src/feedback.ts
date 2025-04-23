import { getClient, getCurrentScope } from './currentScopes';
import type { EventHint } from './types-hoist/event';
import type { FeedbackEvent, SendFeedbackParams } from './types-hoist/feedback';

/**
 * Send user feedback to Sentry.
 */
export function captureFeedback(
  params: SendFeedbackParams,
  hint: EventHint & { includeReplay?: boolean } = {},
  scope = getCurrentScope(),
): string {
  const { message, name, email, url, source, associatedEventId, tags } = params;

  const feedbackEvent: FeedbackEvent = {
    contexts: {
      feedback: {
        contact_email: email,
        name,
        message,
        url,
        source,
        associated_event_id: associatedEventId,
      },
    },
    type: 'feedback',
    level: 'info',
    tags,
  };

  const client = scope?.getClient() || getClient();

  if (client) {
    client.emit('beforeSendFeedback', feedbackEvent, hint);
  }

  const eventId = scope.captureEvent(feedbackEvent, hint);

  return eventId;
}
