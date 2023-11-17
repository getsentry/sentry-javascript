import type { Event, EventHint } from '@sentry/types';
import { logger } from '@sentry/utils';

import type { ReplayContainer } from '../types';
import { isErrorEvent, isFeedbackEvent, isReplayEvent, isTransactionEvent } from '../util/eventUtils';
import { isRrwebError } from '../util/isRrwebError';
import { handleAfterSendEvent } from './handleAfterSendEvent';
import { addFeedbackBreadcrumb } from './util/addFeedbackBreadcrumb';
import { shouldSampleForBufferEvent } from './util/shouldSampleForBufferEvent';

/**
 * Returns a listener to be added to `addGlobalEventProcessor(listener)`.
 */
export function handleGlobalEventListener(
  replay: ReplayContainer,
  includeAfterSendEventHandling = false,
): (event: Event, hint: EventHint) => Event | null {
  const afterSendHandler = includeAfterSendEventHandling ? handleAfterSendEvent(replay) : undefined;

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
        void replay.flush();
        event.contexts.feedback.replay_id = replay.getSessionId();
        // Add a replay breadcrumb for this piece of feedback
        addFeedbackBreadcrumb(replay, event);
        return event;
      }

      // Unless `captureExceptions` is enabled, we want to ignore errors coming from rrweb
      // As there can be a bunch of stuff going wrong in internals there, that we don't want to bubble up to users
      if (isRrwebError(event, hint) && !replay.getOptions()._experiments.captureExceptions) {
        __DEBUG_BUILD__ && logger.log('[Replay] Ignoring error from rrweb internals', event);
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

      // In cases where a custom client is used that does not support the new hooks (yet),
      // we manually call this hook method here
      if (afterSendHandler) {
        // Pretend the error had a 200 response so we always capture it
        afterSendHandler(event, { statusCode: 200 });
      }

      return event;
    },
    { id: 'Replay' },
  );
}
