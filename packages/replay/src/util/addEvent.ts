import { EventType } from '@sentry-internal/rrweb';
import { getCurrentHub } from '@sentry/core';
import { logger } from '@sentry/utils';

import { EventBufferSizeExceededError } from '../eventBuffer/error';
import type { AddEventResult, RecordingEvent, ReplayContainer, ReplayFrameEvent, ReplayPluginOptions } from '../types';
import { logInfo } from './log';
import { timestampToMs } from './timestamp';

function isCustomEvent(event: RecordingEvent): event is ReplayFrameEvent {
  return event.type === EventType.Custom;
}

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

  // Throw out events that are +60min from the initial timestamp
  if (timestampInMs > replay.getContext().initialTimestamp + replay.getOptions().maxReplayDuration) {
    logInfo(
      `[Replay] Skipping event with timestamp ${timestampInMs} because it is after maxReplayDuration`,
      replay.getOptions()._experiments.traceInternals,
    );
    return null;
  }

  try {
    if (isCheckout && replay.recordingMode === 'buffer') {
      replay.eventBuffer.clear();
    }

    if (isCheckout) {
      replay.eventBuffer.hasCheckout = true;
    }

    const replayOptions = replay.getOptions();

    const eventAfterPossibleCallback = maybeApplyCallback(event, replayOptions.beforeAddRecordingEvent);

    if (!eventAfterPossibleCallback) {
      return;
    }

    return await replay.eventBuffer.addEvent(eventAfterPossibleCallback);
  } catch (error) {
    const reason = error && error instanceof EventBufferSizeExceededError ? 'addEventSizeExceeded' : 'addEvent';

    __DEBUG_BUILD__ && logger.error(error);
    await replay.stop({ reason });

    const client = getCurrentHub().getClient();

    if (client) {
      client.recordDroppedEvent('internal_sdk_error', 'replay');
    }
  }
}

function maybeApplyCallback(
  event: RecordingEvent,
  callback: ReplayPluginOptions['beforeAddRecordingEvent'],
): RecordingEvent | null | undefined {
  try {
    if (typeof callback === 'function' && isCustomEvent(event)) {
      return callback(event);
    }
  } catch (error) {
    __DEBUG_BUILD__ &&
      logger.error('[Replay] An error occured in the `beforeAddRecordingEvent` callback, skipping the event...', error);
    return null;
  }

  return event;
}
