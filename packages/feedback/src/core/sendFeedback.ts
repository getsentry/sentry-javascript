import { captureFeedback } from '@sentry/core';
import { getClient } from '@sentry/core';
import type { EventHint, SendFeedback, SendFeedbackParams, TransportMakeRequestResponse } from '@sentry/types';
import type { Event } from '@sentry/types';
import { getLocationHref } from '@sentry/utils';
import { FEEDBACK_API_SOURCE } from '../constants';

/**
 * Public API to send a Feedback item to Sentry
 */
export const sendFeedback: SendFeedback = (
  options: SendFeedbackParams,
  hint: EventHint & { includeReplay?: boolean } = { includeReplay: true },
): Promise<string> => {
  if (!options.message) {
    throw new Error('Unable to submit feedback with empty message.');
  }

  // We want to wait for the feedback to be sent (or not)
  const client = getClient();

  if (!client) {
    throw new Error('No client setup, cannot send feedback.');
  }

  // See https://github.com/getsentry/sentry-javascript/blob/main/packages/core/src/feedback.md for an example feedback object
  const eventId = captureFeedback(
    {
      source: FEEDBACK_API_SOURCE,
      url: getLocationHref(),
      ...options,
    },
    hint,
  );

  // We want to wait for the feedback to be sent (or not)
  return new Promise<string>((resolve, reject) => {
    // After 5s, we want to clear anyhow

    const timeout = setTimeout(() => reject('Unable to determine if Feedback was correctly sent.'), 5_000);

    client.on('afterSendEvent', (event: Event, response: TransportMakeRequestResponse) => {
      if (event.event_id !== eventId) {
        return;
      }

      clearTimeout(timeout);

      // Require valid status codes, otherwise can assume feedback was not sent successfully
      if (
        response &&
        typeof response.statusCode === 'number' &&
        (response.statusCode < 200 || response.statusCode >= 300)
      ) {
        if (response.statusCode === 0) {
          return reject(
            'Unable to send Feedback. This is because of network issues, or because you are using an ad-blocker.',
          );
        }
        return reject('Unable to send Feedback. Invalid response from server.');
      }

      resolve(eventId);
    });
  });
};
