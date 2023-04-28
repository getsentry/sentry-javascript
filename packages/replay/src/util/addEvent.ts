import { getCurrentHub } from '@sentry/core';
import { logger } from '@sentry/utils';

import type { AddEventResult, RecordingEvent, ReplayContainer } from '../types';
import { timestampToMs } from './timestampToMs';

/**
 * Add an event to the event buffer.
 * `isCheckout` is true if this is either the very first event, or an event triggered by `checkoutEveryNms`.
 */
export async function addEvent(
  replay: ReplayContainer,
  event: RecordingEvent,
  isCheckout?: boolean,
): Promise<AddEventResult | null> {
  if (!replay.eventBuffer) {
    // This implies that `_isEnabled` is false
    return null;
  }

  if (replay.isPaused()) {
    // Do not add to event buffer when recording is paused
    return null;
  }

  const timestampInMs = timestampToMs(event.timestamp);

  // Throw out events that happen more than 5 minutes ago. This can happen if
  // page has been left open and idle for a long period of time and user
  // comes back to trigger a new session. The performance entries rely on
  // `performance.timeOrigin`, which is when the page first opened.
  if (timestampInMs + replay.timeouts.sessionIdlePause < Date.now()) {
    return null;
  }

  try {
    if (isCheckout) {
      replay.eventBuffer.clear(replay.recordingMode);
    }

    return await replay.eventBuffer.addEvent(event);
  } catch (error) {
    __DEBUG_BUILD__ && logger.error(error);
    await replay.stop('addEvent');

    const client = getCurrentHub().getClient();

    if (client) {
      client.recordDroppedEvent('internal_sdk_error', 'replay');
    }
  }
}
