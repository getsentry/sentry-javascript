import { EventType } from '@sentry-internal/rrweb';
import { getClient } from '@sentry/core';
import { logger } from '@sentry/utils';

import { DEBUG_BUILD } from '../debug-build';
import { EventBufferSizeExceededError } from '../eventBuffer/error';
import type { AddEventResult, RecordingEvent, ReplayContainer, ReplayFrameEvent, ReplayPluginOptions } from '../types';
import { logInfo } from './log';
import { timestampToMs } from './timestamp';

function isCustomEvent(event: RecordingEvent): event is ReplayFrameEvent {
  return event.type === EventType.Custom;
}

/**
 * Add an event to the event buffer.
 * In contrast to `addEvent`, this does not return a promise & does not wait for the adding of the event to succeed/fail.
 * Instead this returns `true` if we tried to add the event, else false.
 * It returns `false` e.g. if we are paused, disabled, or out of the max replay duration.
 *
 * `isCheckout` is true if this is either the very first event, or an event triggered by `checkoutEveryNms`.
 */
export function addEventSync(replay: ReplayContainer, event: RecordingEvent, isCheckout?: boolean): boolean {
  if (!shouldAddEvent(replay, event)) {
    return false;
  }

  // This should never reject
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  _addEvent(replay, event, isCheckout);

  return true;
}

/**
 * Add an event to the event buffer.
 * Resolves to `null` if no event was added, else to `void`.
 *
 * `isCheckout` is true if this is either the very first event, or an event triggered by `checkoutEveryNms`.
 */
export function addEvent(
  replay: ReplayContainer,
  event: RecordingEvent,
  isCheckout?: boolean,
): Promise<AddEventResult | null> {
  if (!shouldAddEvent(replay, event)) {
    return Promise.resolve(null);
  }

  return _addEvent(replay, event, isCheckout);
}

async function _addEvent(
  replay: ReplayContainer,
  event: RecordingEvent,
  isCheckout?: boolean,
): Promise<AddEventResult | null> {
  if (!replay.eventBuffer) {
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

    DEBUG_BUILD && logger.error(error);
    await replay.stop({ reason });

    const client = getClient();

    if (client) {
      client.recordDroppedEvent('internal_sdk_error', 'replay');
    }
  }
}

/** Exported only for tests. */
export function shouldAddEvent(replay: ReplayContainer, event: RecordingEvent): boolean {
  if (!replay.eventBuffer || replay.isPaused() || !replay.isEnabled()) {
    return false;
  }

  const timestampInMs = timestampToMs(event.timestamp);

  // Throw out events that happen more than 5 minutes ago. This can happen if
  // page has been left open and idle for a long period of time and user
  // comes back to trigger a new session. The performance entries rely on
  // `performance.timeOrigin`, which is when the page first opened.
  if (timestampInMs + replay.timeouts.sessionIdlePause < Date.now()) {
    return false;
  }

  // Throw out events that are +60min from the initial timestamp
  if (timestampInMs > replay.getContext().initialTimestamp + replay.getOptions().maxReplayDuration) {
    logInfo(
      `[Replay] Skipping event with timestamp ${timestampInMs} because it is after maxReplayDuration`,
      replay.getOptions()._experiments.traceInternals,
    );
    return false;
  }

  return true;
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
    DEBUG_BUILD &&
      logger.error('[Replay] An error occured in the `beforeAddRecordingEvent` callback, skipping the event...', error);
    return null;
  }

  return event;
}
