import type { EventHint, FeedbackEvent, SendFeedbackParams } from '@sentry/types';
import { dropUndefinedKeys } from '@sentry/utils';
import { getClient, getCurrentScope } from './currentScopes';

/**
 * Send user feedback to Sentry.
 */
export function captureFeedback(
  params: SendFeedbackParams,
  hint: EventHint & { includeReplay?: boolean } = {},
  scope = getCurrentScope(),
): string {
  const { message, name, email, url, source, associatedEventId, tags } = params;

  // See https://github.com/getsentry/sentry-javascript/blob/main/packages/core/src/feedback.md for an example feedback object
  const feedbackEvent: FeedbackEvent = {
    contexts: {
      feedback: dropUndefinedKeys({
        contact_email: email,
        name,
        message,
        url,
        source,
        associated_event_id: associatedEventId,
      }),
    },
    type: 'feedback',
    level: 'info',
    tags,
  };

  const client = (scope && scope.getClient()) || getClient();

  if (client) {
    client.emit('beforeSendFeedback', feedbackEvent, hint);
  }

  const eventId = scope.captureEvent(feedbackEvent, hint);

  return eventId;
}
