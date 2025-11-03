import { getClient } from '@sentry/core';
import { EventType } from '@sentry-internal/rrweb';
import { DEBUG_BUILD } from '../debug-build';
import { EventBufferSizeExceededError } from '../eventBuffer/error';
import type { AddEventResult, RecordingEvent, ReplayContainer, ReplayFrameEvent, ReplayPluginOptions } from '../types';
import { debug } from './logger';
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
  const { eventBuffer } = replay;

  if (!eventBuffer || (eventBuffer.waitForCheckout && !isCheckout)) {
    return null;
  }

  const isBufferMode = replay.recordingMode === 'buffer';

  try {
    if (isCheckout && isBufferMode) {
      eventBuffer.clear();
    }

    if (isCheckout) {
      eventBuffer.hasCheckout = true;
      eventBuffer.waitForCheckout = false;
    }

    const replayOptions = replay.getOptions();

    const eventAfterPossibleCallback = maybeApplyCallback(event, replayOptions.beforeAddRecordingEvent);

    if (!eventAfterPossibleCallback) {
      return;
    }

    return await eventBuffer.addEvent(eventAfterPossibleCallback);
  } catch (error) {
    const isExceeded = error && error instanceof EventBufferSizeExceededError;
    const reason = isExceeded ? 'addEventSizeExceeded' : 'addEvent';
    const client = getClient();

    if (client) {
      // We are limited in the drop reasons:
      // https://github.com/getsentry/snuba/blob/6c73be60716c2fb1c30ca627883207887c733cbd/rust_snuba/src/processors/outcomes.rs#L39
      const dropReason = isExceeded ? 'buffer_overflow' : 'internal_sdk_error';
      client.recordDroppedEvent(dropReason, 'replay');
    }

    if (isExceeded && isBufferMode) {
      // Clear buffer and wait for next checkout
      eventBuffer.clear();
      eventBuffer.waitForCheckout = true;

      return null;
    }

    replay.handleException(error);

    await replay.stop({ reason });
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
    DEBUG_BUILD &&
      debug.infoTick(`Skipping event with timestamp ${timestampInMs} because it is after maxReplayDuration`);
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
      debug.exception(error, 'An error occurred in the `beforeAddRecordingEvent` callback, skipping the event...');
    return null;
  }

  return event;
}
