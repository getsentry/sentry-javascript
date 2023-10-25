import type { BrowserClient, Replay } from '@sentry/browser';
import { getCurrentHub } from '@sentry/core';
import { getLocationHref } from '@sentry/utils';

import type { SendFeedbackOptions } from './types';
import { sendFeedbackRequest } from './util/sendFeedbackRequest';

interface SendFeedbackParams {
  message: string;
  name?: string;
  email?: string;
  url?: string;
}

/**
 * Public API to send a Feedback item to Sentry
 */
export function sendFeedback(
  { name, email, message, url = getLocationHref() }: SendFeedbackParams,
  { referrer, includeReplay = true }: SendFeedbackOptions = {},
): ReturnType<typeof sendFeedbackRequest> {
  const hub = getCurrentHub();
  const client = hub && hub.getClient<BrowserClient>();
  const replay = includeReplay && client ? (client.getIntegrationById('Replay') as Replay | undefined) : undefined;

  // Prepare session replay
  replay && replay.flush();
  const replayId = replay && replay.getReplayId();

  return sendFeedbackRequest({
    feedback: {
      name,
      email,
      message,
      url,
      replay_id: replayId,
    },
    referrer,
  });
}
