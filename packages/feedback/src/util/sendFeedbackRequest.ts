import { createEventEnvelope, getCurrentHub } from '@sentry/core';
import type { FeedbackEvent, TransportMakeRequestResponse } from '@sentry/types';

import { FEEDBACK_API_SOURCE, FEEDBACK_WIDGET_SOURCE } from '../constants';
import type { SendFeedbackData, SendFeedbackOptions } from '../types';
import { prepareFeedbackEvent } from './prepareFeedbackEvent';

/**
 * Send feedback using transport
 */
export async function sendFeedbackRequest(
  { feedback: { message, email, name, source, url } }: SendFeedbackData,
  { includeReplay = true }: SendFeedbackOptions = {},
): Promise<void | TransportMakeRequestResponse> {
  const hub = getCurrentHub();
  const client = hub.getClient();
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
        url,
        source,
      },
    },
    type: 'feedback',
  };

  return new Promise((resolve, reject) => {
    hub.withScope(async scope => {
      // No use for breadcrumbs in feedback
      scope.clearBreadcrumbs();

      if ([FEEDBACK_API_SOURCE, FEEDBACK_WIDGET_SOURCE].includes(String(source))) {
        scope.setLevel('info');
      }

      const feedbackEvent = await prepareFeedbackEvent({
        scope,
        client,
        event: baseEvent,
      });

      if (feedbackEvent === null) {
        resolve();
        return;
      }

      if (client && client.emit) {
        client.emit('afterPrepareFeedback', feedbackEvent, { includeReplay: Boolean(includeReplay) });
      }

      const envelope = createEventEnvelope(
        feedbackEvent,
        dsn,
        client.getOptions()._metadata,
        client.getOptions().tunnel,
      );

      let response: void | TransportMakeRequestResponse;

      try {
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
        reject(error);
      }

      // TODO (v8): we can remove this guard once transport.send's type signature doesn't include void anymore
      if (!response) {
        resolve(response);
        return;
      }

      // Require valid status codes, otherwise can assume feedback was not sent successfully
      if (typeof response.statusCode === 'number' && (response.statusCode < 200 || response.statusCode >= 300)) {
        reject(new Error('Unable to send Feedback'));
      }

      resolve(response);
    });
  });
}

/*
 * For reference, the fully built event looks something like this:
 * {
 *     "type": "feedback",
 *     "event_id": "d2132d31b39445f1938d7e21b6bf0ec4",
 *     "timestamp": 1597977777.6189718,
 *     "dist": "1.12",
 *     "platform": "javascript",
 *     "environment": "production",
 *     "release": 42,
 *     "tags": {"transaction": "/organizations/:orgId/performance/:eventSlug/"},
 *     "sdk": {"name": "name", "version": "version"},
 *     "user": {
 *         "id": "123",
 *         "username": "user",
 *         "email": "user@site.com",
 *         "ip_address": "192.168.11.12",
 *     },
 *     "request": {
 *         "url": None,
 *         "headers": {
 *             "user-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.5 Safari/605.1.15"
 *         },
 *     },
 *     "contexts": {
 *         "feedback": {
 *             "message": "test message",
 *             "contact_email": "test@example.com",
 *             "type": "feedback",
 *         },
 *         "trace": {
 *             "trace_id": "4C79F60C11214EB38604F4AE0781BFB2",
 *             "span_id": "FA90FDEAD5F74052",
 *             "type": "trace",
 *         },
 *         "replay": {
 *             "replay_id": "e2d42047b1c5431c8cba85ee2a8ab25d",
 *         },
 *     },
 *   }
 */
