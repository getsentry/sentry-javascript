import { SESSION_IDLE_DURATION } from '../constants';
import type { RecordingEvent, ReplayContainer } from '../types';

/**
 * Add an event to the event buffer
 */
export function addEvent(replay: ReplayContainer, event: RecordingEvent, isCheckout?: boolean): boolean {
  const { eventBuffer, session } = replay;

  if (!eventBuffer) {
    // This implies that `_isEnabled` is false
    return false;
  }

  if (replay.isPaused() || !session) {
    // Do not add to event buffer when recording is paused
    return false;
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
    return false;
  }

  // Only record earliest event if a new session was created, otherwise it
  // shouldn't be relevant
  const earliestEvent = replay.getContext().earliestEvent;
  if (session.segmentId === 0 && (!earliestEvent || timestampInMs < earliestEvent)) {
    replay.getContext().earliestEvent = timestampInMs;
  }

  if (isCheckout) {
    if (replay.recordingMode === 'error') {
      eventBuffer.clear(true);

      // Ensure we have the correct first checkout timestamp when an error occurs
      if (!session.segmentId) {
        replay.getContext().earliestEvent = eventBuffer.getFirstCheckoutTimestamp();
      }
    } else {
      eventBuffer.clear();
    }
  }

  eventBuffer.addEvent(event, isCheckout);
  return true;
}
