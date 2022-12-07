import { SESSION_IDLE_DURATION } from '../constants';
import type { ReplayContainer } from '../replay';
import { RecordingEvent } from '../types';

/**
 * Add an event to the event buffer
 */
export function addEvent(replay: ReplayContainer, event: RecordingEvent, isCheckout?: boolean): void {
  if (!replay.eventBuffer) {
    // This implies that `_isEnabled` is false
    return;
  }

  if (replay.isPaused()) {
    // Do not add to event buffer when recording is paused
    return;
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
    return;
  }

  // Only record earliest event if a new session was created, otherwise it
  // shouldn't be relevant
  const earliestEvent = replay.getContext().earliestEvent;
  if (replay.session?.segmentId === 0 && (!earliestEvent || timestampInMs < earliestEvent)) {
    replay.getContext().earliestEvent = timestampInMs;
  }

  replay.eventBuffer.addEvent(event, isCheckout);
}
