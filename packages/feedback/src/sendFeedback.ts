import type { BrowserClient, Replay } from '@sentry/browser';
import { getCurrentHub } from '@sentry/core';

import { sendFeedbackRequest } from './util/sendFeedbackRequest';

interface SendFeedbackParams {
  message: string;
  name?: string;
  email?: string;
  url?: string;
}

interface SendFeedbackOptions {
  includeReplay?: boolean;
}

/**
 * Public API to send a Feedback item to Sentry
 */
export function sendFeedback({name, email, message, url = document.location.href}: SendFeedbackParams, {includeReplay = true}: SendFeedbackOptions = {}) {
    const replay = includeReplay ? getCurrentHub()?.getClient<BrowserClient>()?.getIntegrationById('Replay') as Replay | undefined : undefined;

    // Prepare session replay
    replay?.flush();
    const replayId = replay?.getReplayId();

    return sendFeedbackRequest({
      feedback: {
        name,
        email,
        message,
        url,
        replay_id: replayId,
      }
    });
}
