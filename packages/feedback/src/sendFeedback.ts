import type { BrowserClient, Replay } from '@sentry/browser';
import { getCurrentHub } from '@sentry/core';
import { getLocationHref } from '@sentry/utils';

import type { SendFeedbackOptions } from './types';
import { sendFeedbackRequest } from './util/sendFeedbackRequest';

interface SendFeedbackParams {
  comments: string;
  name?: string;
  email?: string;
  url?: string;
  source?: string;
}

/**
 * Public API to send a Feedback item to Sentry
 */
export function sendFeedback(
  { name, email, comments, source = 'api', url = getLocationHref() }: SendFeedbackParams,
  { includeReplay = true }: SendFeedbackOptions = {},
): ReturnType<typeof sendFeedbackRequest> {
  const client = getCurrentHub().getClient<BrowserClient>();
  const replay = includeReplay && client ? (client.getIntegrationById('Replay') as Replay | undefined) : undefined;

  // Prepare session replay
  replay && replay.flush();
  const replayId = replay && replay.getReplayId();

  if (!comments) {
    throw new Error('Unable to submit feedback with empty message');
  }

  return sendFeedbackRequest({
    feedback: {
      name,
      email,
      comments,
      url,
      replay_id: replayId,
      source,
    },
  });
}
