import { logger } from '@sentry/utils';

import type { ReplayContainer } from '../replay';
import { saveSession } from '../session/saveSession';
import type { RecordingEvent } from '../types';
import { addEvent } from './addEvent';

type RecordingEmitCallback = (event: RecordingEvent, isCheckout?: boolean) => void;

/**
 * Handler for recording events.
 *
 * Adds to event buffer, and has varying flushing behaviors if the event was a checkout.
 */
export function getHandleRecordingEmit(replay: ReplayContainer): RecordingEmitCallback {
  return (event: RecordingEvent, isCheckout?: boolean) => {
    // If this is false, it means session is expired, create and a new session and wait for checkout
    if (!replay.checkAndHandleExpiredSession()) {
      __DEBUG_BUILD__ && logger.warn('[Replay] Received replay event after session expired.');

      return;
    }

    replay.addUpdate(() => {
      // The session is always started immediately on pageload/init, but for
      // error-only replays, it should reflect the most recent checkout
      // when an error occurs. Clear any state that happens before this current
      // checkout. This needs to happen before `addEvent()` which updates state
      // dependent on this reset.
      if (replay.recordingMode === 'error' && event.type === 2) {
        replay.setInitialState();
      }

      // We need to clear existing events on a checkout, otherwise they are
      // incremental event updates and should be appended
      void addEvent(replay, event, isCheckout);

      // Different behavior for full snapshots (type=2), ignore other event types
      // See https://github.com/rrweb-io/rrweb/blob/d8f9290ca496712aa1e7d472549480c4e7876594/packages/rrweb/src/types.ts#L16
      if (event.type !== 2) {
        return false;
      }

      // If there is a previousSessionId after a full snapshot occurs, then
      // the replay session was started due to session expiration. The new session
      // is started before triggering a new checkout and contains the id
      // of the previous session. Do not immediately flush in this case
      // to avoid capturing only the checkout and instead the replay will
      // be captured if they perform any follow-up actions.
      if (replay.session && replay.session.previousSessionId) {
        return true;
      }

      // See note above re: session start needs to reflect the most recent
      // checkout.
      if (replay.recordingMode === 'error' && replay.session) {
        const { earliestEvent } = replay.getContext();
        if (earliestEvent) {
          replay.session.started = earliestEvent;

          if (replay.getOptions().stickySession) {
            saveSession(replay.session);
          }
        }
      }

      // Flush immediately so that we do not miss the first segment, otherwise
      // it can prevent loading on the UI. This will cause an increase in short
      // replays (e.g. opening and closing a tab quickly), but these can be
      // filtered on the UI.
      if (replay.recordingMode === 'session') {
        // We want to ensure the worker is ready, as otherwise we'd always send the first event uncompressed
        void replay.flushImmediate();
      }

      return true;
    });
  };
}
