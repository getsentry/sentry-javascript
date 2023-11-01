import { getCurrentHub } from '@sentry/core';
import type { FeedbackEvent } from '@sentry/types';
import { uuid4 } from '@sentry/utils';

import type { SendFeedbackData } from '../types';

/**
 * Send feedback using `fetch()`
 */
export function sendFeedbackRequest({
  feedback: { message, email, name, replay_id, url },
}: SendFeedbackData): string | undefined {
  const hub = getCurrentHub();
  const client = hub.getClient();
  const scope = hub.getScope();

  if (!client) {
    return;
  }

  const baseEvent: FeedbackEvent = {
    contexts: {
      feedback: {
        contact_email: email,
        name,
        message,
        replay_id,
        url,
      },
    },
    type: 'feedback',
  };

  return client.captureEvent(
    baseEvent,
    {
      event_id: uuid4(),
    },
    scope,
  );
}
