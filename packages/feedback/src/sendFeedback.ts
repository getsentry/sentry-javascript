import { getLocationHref } from '@sentry/utils';

import { FEEDBACK_API_SOURCE } from './constants';
import type { SendFeedbackOptions } from './types';
import { sendFeedbackRequest } from './util/sendFeedbackRequest';

interface SendFeedbackParams {
  message: string;
  name?: string;
  email?: string;
  url?: string;
  source?: string;
}

/**
 * Public API to send a Feedback item to Sentry
 */
export function sendFeedback(
  { name, email, message, source = FEEDBACK_API_SOURCE, url = getLocationHref() }: SendFeedbackParams,
  options: SendFeedbackOptions = {},
): ReturnType<typeof sendFeedbackRequest> {
  if (!message) {
    throw new Error('Unable to submit feedback with empty message');
  }

  return sendFeedbackRequest(
    {
      feedback: {
        name,
        email,
        message,
        url,
        source,
      },
    },
    options,
  );
}
