import type { BrowserClient, Replay } from '@sentry/browser';
import { getCurrentHub } from '@sentry/core';
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
  { includeReplay = true }: SendFeedbackOptions = {},
): ReturnType<typeof sendFeedbackRequest> {
  const client = getCurrentHub().getClient<BrowserClient>();
  const replay = includeReplay && client ? (client.getIntegrationById('Replay') as Replay | undefined) : undefined;

  // Prepare session replay
  replay && replay.flush();
  const replayId = replay && replay.getReplayId();

  if (!message) {
    throw new Error('Unable to submit feedback with empty message');
  }

  return sendFeedbackRequest({
    feedback: {
      name,
      email,
      message,
      url,
      replay_id: replayId,
      source,
    },
  });
}
