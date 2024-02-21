import type { Event, EventHint } from '@sentry/types';
import { logger } from '@sentry/utils';

import { DEBUG_BUILD } from '../debug-build';
import type { ReplayContainer } from '../types';
import { isErrorEvent, isFeedbackEvent, isReplayEvent, isTransactionEvent } from '../util/eventUtils';
import { isRrwebError } from '../util/isRrwebError';
import { addFeedbackBreadcrumb } from './util/addFeedbackBreadcrumb';
import { shouldSampleForBufferEvent } from './util/shouldSampleForBufferEvent';

/**
 * Returns a listener to be added to `addEventProcessor(listener)`.
 */
export function handleGlobalEventListener(replay: ReplayContainer): (event: Event, hint: EventHint) => Event | null {
  return Object.assign(
    (event: Event, hint: EventHint) => {
      // Do nothing if replay has been disabled
      if (!replay.isEnabled()) {
        return event;
      }

      if (isReplayEvent(event)) {
        // Replays have separate set of breadcrumbs, do not include breadcrumbs
        // from core SDK
        delete event.breadcrumbs;
        return event;
      }

      // We only want to handle errors, transactions, and feedbacks, nothing else
      if (!isErrorEvent(event) && !isTransactionEvent(event) && !isFeedbackEvent(event)) {
        return event;
      }

      // Ensure we do not add replay_id if the session is expired
      const isSessionActive = replay.checkAndHandleExpiredSession();
      if (!isSessionActive) {
        return event;
      }

      if (isFeedbackEvent(event)) {
        // This should never reject
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        replay.flush();
        event.contexts.feedback.replay_id = replay.getSessionId();
        // Add a replay breadcrumb for this piece of feedback
        addFeedbackBreadcrumb(replay, event);
        return event;
      }

      // Unless `captureExceptions` is enabled, we want to ignore errors coming from rrweb
      // As there can be a bunch of stuff going wrong in internals there, that we don't want to bubble up to users
      if (isRrwebError(event, hint) && !replay.getOptions()._experiments.captureExceptions) {
        DEBUG_BUILD && logger.log('[Replay] Ignoring error from rrweb internals', event);
        return null;
      }

      // When in buffer mode, we decide to sample here.
      // Later, in `handleAfterSendEvent`, if the replayId is set, we know that we sampled
      // And convert the buffer session to a full session
      const isErrorEventSampled = shouldSampleForBufferEvent(replay, event);

      // Tag errors if it has been sampled in buffer mode, or if it is session mode
      // Only tag transactions if in session mode
      const shouldTagReplayId = isErrorEventSampled || replay.recordingMode === 'session';

      if (shouldTagReplayId) {
        event.tags = { ...event.tags, replayId: replay.getSessionId() };
      }

      return event;
    },
    { id: 'Replay' },
  );
}
