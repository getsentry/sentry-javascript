import { captureException, setContext } from '@sentry/core';

import { RETRY_BASE_INTERVAL, RETRY_MAX_COUNT, UNABLE_TO_SEND_REPLAY } from '../constants';
import type { SendReplay } from '../types';
import { sendReplayRequest } from './sendReplayRequest';

/**
 * Finalize and send the current replay event to Sentry
 */
export async function sendReplay(
  { replayId, events, segmentId, includeReplayStartTimestamp, eventContext, session, options }: SendReplay,
  retryConfig = {
    count: 0,
    interval: RETRY_BASE_INTERVAL,
  },
): Promise<unknown> {
  // short circuit if there's no events to upload (this shouldn't happen as _runFlush makes this check)
  if (!events.length) {
    return;
  }

  try {
    await sendReplayRequest({
      events,
      replayId,
      segmentId,
      includeReplayStartTimestamp,
      eventContext,
      session,
      options,
    });
    return true;
  } catch (err) {
    // Capture error for every failed replay
    setContext('Replays', {
      _retryCount: retryConfig.count,
    });

    if (__DEBUG_BUILD__ && options._experiments && options._experiments.captureExceptions) {
      captureException(err);
    }

    // If an error happened here, it's likely that uploading the attachment
    // failed, we'll can retry with the same events payload
    if (retryConfig.count >= RETRY_MAX_COUNT) {
      throw new Error(`${UNABLE_TO_SEND_REPLAY} - max retries exceeded`);
    }

    // will retry in intervals of 5, 10, 30
    retryConfig.interval *= ++retryConfig.count;

    return await new Promise((resolve, reject) => {
      setTimeout(async () => {
        try {
          await sendReplay(
            {
              replayId,
              events,
              segmentId,
              includeReplayStartTimestamp,
              eventContext,
              session,
              options,
            },
            retryConfig,
          );
          resolve(true);
        } catch (err) {
          reject(err);
        }
      }, retryConfig.interval);
    });
  }
}
