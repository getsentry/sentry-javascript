import { createEventEnvelope, getCurrentHub } from '@sentry/core';
import type { FeedbackEvent, TransportMakeRequestResponse } from '@sentry/types';

import type { SendFeedbackData } from '../types';
import { prepareFeedbackEvent } from './prepareFeedbackEvent';

/**
 * Send feedback using transport
 */
export async function sendFeedbackRequest({
  feedback: { message, email, name, replay_id, url },
}: SendFeedbackData): Promise<void | TransportMakeRequestResponse> {
  debugger;
  const hub = getCurrentHub();
  const client = hub.getClient();
  const scope = hub.getScope();
  const transport = client && client.getTransport();
  const dsn = client && client.getDsn();

  if (!client || !transport || !dsn) {
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

  const feedbackEvent = await prepareFeedbackEvent({
    scope,
    client,
    event: baseEvent,
  });

  if (feedbackEvent === null) {
    return;
  }

  /*
  For reference, the fully built event looks something like this:
  {
      "type": "feedback",
      "event_id": "d2132d31b39445f1938d7e21b6bf0ec4",
      "timestamp": 1597977777.6189718,
      "dist": "1.12",
      "platform": "javascript",
      "environment": "production",
      "release": 42,
      "tags": {"transaction": "/organizations/:orgId/performance/:eventSlug/"},
      "sdk": {"name": "name", "version": "version"},
      "user": {
          "id": "123",
          "username": "user",
          "email": "user@site.com",
          "ip_address": "192.168.11.12",
      },
      "request": {
          "url": None,
          "headers": {
              "user-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.5 Safari/605.1.15"
          },
      },
      "contexts": {
          "feedback": {
              "message": "test message",
              "contact_email": "test@example.com",
              "type": "feedback",
          },
          "trace": {
              "trace_id": "4C79F60C11214EB38604F4AE0781BFB2",
              "span_id": "FA90FDEAD5F74052",
              "type": "trace",
          },
          "replay": {
              "replay_id": "e2d42047b1c5431c8cba85ee2a8ab25d",
          },
      },
    }
  */

  const envelope = createEventEnvelope(feedbackEvent, dsn, client.getOptions()._metadata, client.getOptions().tunnel);

  let response: void | TransportMakeRequestResponse;

  try {
    console.log(envelope);
    response = await transport.send(envelope);
  } catch (err) {
    const error = new Error('Unable to send Feedback');

    try {
      // In case browsers don't allow this property to be writable
      // @ts-expect-error This needs lib es2022 and newer
      error.cause = err;
    } catch {
      // nothing to do
    }
    throw error;
  }

  // TODO (v8): we can remove this guard once transport.send's type signature doesn't include void anymore
  if (!response) {
    return response;
  }

  // If the status code is invalid, we want to immediately stop & not retry
  if (typeof response.statusCode === 'number' && (response.statusCode < 200 || response.statusCode >= 300)) {
    throw new Error('Unable to send Feedback');
  }

  return response;
}
