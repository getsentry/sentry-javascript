import { getCurrentHub } from '@sentry/core';
import { logger } from '@sentry/utils';

import { SESSION_IDLE_DURATION, EVENT_ROLLING_WINDOW_TIME } from '../constants';
import type { AddEventResult, RecordingEvent, ReplayContainer } from '../types';
import { EventCounter } from './EventCounter';

/**
 * Add an event to the event buffer
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

  // TODO: sadness -- we will want to normalize timestamps to be in ms -
  // requires coordination with frontend
  const isMs = event.timestamp > 9999999999;
  const timestampInMs = isMs ? event.timestamp : event.timestamp * 1000;

  // Throw out events that happen more than 5 minutes ago. This can happen if
  // page has been left open and idle for a long period of time and user
  // comes back to trigger a new session. The performance entries rely on
  // `performance.timeOrigin`, which is when the page first opened.
  if (timestampInMs + SESSION_IDLE_DURATION < new Date().getTime()) {
    return null;
  }

  // Only record earliest event if a new session was created, otherwise it
  // shouldn't be relevant
  const earliestEvent = replay.getContext().earliestEvent;
  if (replay.session && replay.session.segmentId === 0 && (!earliestEvent || timestampInMs < earliestEvent)) {
    replay.getContext().earliestEvent = timestampInMs;
  }

  replay.eventCounter.add();

  // If we exceed the event limit, pause the recording and resume it after the rolling window time
  // The resuming will trigger a full checkout
  // This means the user will have a brief gap in their recording, but it's better than freezing the page due to too many events happening at the same time
  // Afterwards, things will continue as normally
  if (replay.eventCounter.hasExceededLimit()) {
    replay.eventCounter = new EventCounter();
    replay.pause();
    setTimeout(() => replay.resume(), EVENT_ROLLING_WINDOW_TIME);
    return;
  }

  try {
    return await replay.eventBuffer.addEvent(event, isCheckout);
  } catch (error) {
    __DEBUG_BUILD__ && logger.error(error);
    replay.stop('addEvent');

    const client = getCurrentHub().getClient();

    if (client) {
      client.recordDroppedEvent('internal_sdk_error', 'replay');
    }
  }
}
