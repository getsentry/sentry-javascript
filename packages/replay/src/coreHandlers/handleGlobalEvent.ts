import { Event } from '@sentry/types';

import { REPLAY_EVENT_NAME, UNABLE_TO_SEND_REPLAY } from '../constants';
import type { ReplayContainer } from '../replay';
import { addInternalBreadcrumb } from '../util/addInternalBreadcrumb';

/**
 * Returns a listener to be added to `addGlobalEventProcessor(listener)`.
 */
export function handleGlobalEventListener(replay: ReplayContainer): (event: Event) => Event {
  return (event: Event) => {
    // Do not apply replayId to the root event
    if (
      // @ts-ignore new event type
      event.type === REPLAY_EVENT_NAME
    ) {
      // Replays have separate set of breadcrumbs, do not include breadcrumbs
      // from core SDK
      delete event.breadcrumbs;
      return event;
    }

    // Only tag transactions with replayId if not waiting for an error
    // @ts-ignore private
    if (event.type !== 'transaction' || !replay._waitForError) {
      event.tags = { ...event.tags, replayId: replay.session?.id };
    }

    // Collect traceIds in _context regardless of `_waitForError` - if it's true,
    // _context gets cleared on every checkout
    if (event.type === 'transaction' && event.contexts && event.contexts.trace && event.contexts.trace.trace_id) {
      replay.getContext().traceIds.add(event.contexts.trace.trace_id as string);
      return event;
    }

    // no event type means error
    if (!event.type) {
      replay.getContext().errorIds.add(event.event_id as string);
    }

    const exc = event.exception?.values?.[0];
    addInternalBreadcrumb({
      message: `Tagging event (${event.event_id}) - ${event.message} - ${exc?.type || 'Unknown'}: ${
        exc?.value || 'n/a'
      }`,
    });

    // Need to be very careful that this does not cause an infinite loop
    if (
      // @ts-ignore private
      replay._waitForError &&
      event.exception &&
      event.message !== UNABLE_TO_SEND_REPLAY // ignore this error because otherwise we could loop indefinitely with trying to capture replay and failing
    ) {
      setTimeout(async () => {
        // Allow flush to complete before resuming as a session recording, otherwise
        // the checkout from `startRecording` may be included in the payload.
        // Prefer to keep the error replay as a separate (and smaller) segment
        // than the session replay.
        await replay.flushImmediate();

        if (replay.stopRecording()) {
          // Reset all "capture on error" configuration before
          // starting a new recording
          // @ts-ignore private
          replay._waitForError = false;
          replay.startRecording();
        }
      });
    }

    return event;
  };
}
