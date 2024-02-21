import { captureException, setContext } from '@sentry/core';

import { RETRY_BASE_INTERVAL, RETRY_MAX_COUNT, UNABLE_TO_SEND_REPLAY } from '../constants';
import { DEBUG_BUILD } from '../debug-build';
import type { SendReplayData } from '../types';
import { RateLimitError, TransportStatusCodeError, sendReplayRequest } from './sendReplayRequest';

/**
 * Finalize and send the current replay event to Sentry
 */
export async function sendReplay(
  replayData: SendReplayData,
  retryConfig = {
    count: 0,
    interval: RETRY_BASE_INTERVAL,
  },
): Promise<unknown> {
  const { recordingData, options } = replayData;

  // short circuit if there's no events to upload (this shouldn't happen as _runFlush makes this check)
  if (!recordingData.length) {
    return;
  }

  try {
    await sendReplayRequest(replayData);
    return true;
  } catch (err) {
    if (err instanceof TransportStatusCodeError || err instanceof RateLimitError) {
      throw err;
    }

    // Capture error for every failed replay
    setContext('Replays', {
      _retryCount: retryConfig.count,
    });

    if (DEBUG_BUILD && options._experiments && options._experiments.captureExceptions) {
      captureException(err);
    }

    // If an error happened here, it's likely that uploading the attachment
    // failed, we'll can retry with the same events payload
    if (retryConfig.count >= RETRY_MAX_COUNT) {
      const error = new Error(`${UNABLE_TO_SEND_REPLAY} - max retries exceeded`);

      try {
        // In case browsers don't allow this property to be writable
        // @ts-expect-error This needs lib es2022 and newer
        error.cause = err;
      } catch {
        // nothing to do
      }

      throw error;
    }

    // will retry in intervals of 5, 10, 30
    retryConfig.interval *= ++retryConfig.count;

    return new Promise((resolve, reject) => {
      setTimeout(async () => {
        try {
          await sendReplay(replayData, retryConfig);
          resolve(true);
        } catch (err) {
          reject(err);
        }
      }, retryConfig.interval);
    });
  }
}
