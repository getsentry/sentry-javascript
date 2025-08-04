import type { Event, EventHint, SendFeedback, SendFeedbackParams, TransportMakeRequestResponse } from '@sentry/core';
import { captureFeedback, getClient, getCurrentScope, getLocationHref } from '@sentry/core';
import { FEEDBACK_API_SOURCE } from '../constants';

/**
 * Public API to send a Feedback item to Sentry
 */
export const sendFeedback: SendFeedback = (
  params: SendFeedbackParams,
  hint: EventHint & { includeReplay?: boolean } = { includeReplay: true },
): Promise<string> => {
  if (!params.message) {
    throw new Error('Unable to submit feedback with empty message');
  }

  // We want to wait for the feedback to be sent (or not)
  const client = getClient();

  if (!client) {
    throw new Error('No client setup, cannot send feedback.');
  }

  if (params.tags && Object.keys(params.tags).length) {
    getCurrentScope().setTags(params.tags);
  }
  const eventId = captureFeedback(
    {
      source: FEEDBACK_API_SOURCE,
      url: getLocationHref(),
      ...params,
    },
    hint,
  );

  // We want to wait for the feedback to be sent (or not)
  return new Promise<string>((resolve, reject) => {
    // After 30s, we want to clear anyhow
    const timeout = setTimeout(() => reject('Unable to determine if Feedback was correctly sent.'), 30_000);

    const cleanup = client.on('afterSendEvent', (event: Event, response: TransportMakeRequestResponse) => {
      if (event.event_id !== eventId) {
        return;
      }

      clearTimeout(timeout);
      cleanup();

      // Require valid status codes, otherwise can assume feedback was not sent successfully
      if (response?.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
        return resolve(eventId);
      }

      if (response?.statusCode === 403) {
        return reject(
          'Unable to send feedback. This could be because this domain is not in your list of allowed domains.',
        );
      }

      return reject(
        'Unable to send feedback. This could be because of network issues, or because you are using an ad-blocker.',
      );
    });
  });
};

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
