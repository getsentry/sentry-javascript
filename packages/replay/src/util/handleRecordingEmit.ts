import { logger } from '@sentry/utils';

import { saveSession } from '../session/saveSession';
import type { AddEventResult, RecordingEvent, ReplayContainer } from '../types';
import { EventType } from '../types/rrweb';
import { addEvent } from './addEvent';

type RecordingEmitCallback = (event: RecordingEvent, isCheckout?: boolean) => void;

/**
 * Handler for recording events.
 *
 * Adds to event buffer, and has varying flushing behaviors if the event was a checkout.
 */
export function getHandleRecordingEmit(replay: ReplayContainer): RecordingEmitCallback {
  let hadFirstEvent = false;

  return (event: RecordingEvent, _isCheckout?: boolean) => {
    // If this is false, it means session is expired, create and a new session and wait for checkout
    if (!replay.checkAndHandleExpiredSession()) {
      __DEBUG_BUILD__ && logger.warn('[Replay] Received replay event after session expired.');

      return;
    }

    // `_isCheckout` is only set when the checkout is due to `checkoutEveryNms`
    // We also want to treat the first event as a checkout, so we handle this specifically here
    const isCheckout = _isCheckout || !hadFirstEvent;
    hadFirstEvent = true;

    // The handler returns `true` if we do not want to trigger debounced flush, `false` if we want to debounce flush.
    replay.addUpdate(() => {
      // The session is always started immediately on pageload/init, but for
      // error-only replays, it should reflect the most recent checkout
      // when an error occurs. Clear any state that happens before this current
      // checkout. This needs to happen before `addEvent()` which updates state
      // dependent on this reset.
      if (replay.recordingMode === 'buffer' && isCheckout) {
        replay.setInitialState();
      }

      // We need to clear existing events on a checkout, otherwise they are
      // incremental event updates and should be appended
      void addEvent(replay, event, isCheckout);

      // Different behavior for full snapshots (type=2), ignore other event types
      // See https://github.com/rrweb-io/rrweb/blob/d8f9290ca496712aa1e7d472549480c4e7876594/packages/rrweb/src/types.ts#L16
      if (!isCheckout) {
        return false;
      }

      // Additionally, create a meta event that will capture certain SDK settings.
      // In order to handle buffer mode, this needs to either be done when we
      // receive checkout events or at flush time.
      //
      // `isCheckout` is always true, but want to be explicit that it should
      // only be added for checkouts
      void addSettingsEvent(replay, isCheckout);

      // If there is a previousSessionId after a full snapshot occurs, then
      // the replay session was started due to session expiration. The new session
      // is started before triggering a new checkout and contains the id
      // of the previous session. Do not immediately flush in this case
      // to avoid capturing only the checkout and instead the replay will
      // be captured if they perform any follow-up actions.
      if (replay.session && replay.session.previousSessionId) {
        return true;
      }

      // When in buffer mode, make sure we adjust the session started date to the current earliest event of the buffer
      // this should usually be the timestamp of the checkout event, but to be safe...
      if (replay.recordingMode === 'buffer' && replay.session && replay.eventBuffer) {
        const earliestEvent = replay.eventBuffer.getEarliestTimestamp();
        if (earliestEvent) {
          replay.session.started = earliestEvent;

          if (replay.getOptions().stickySession) {
            saveSession(replay.session);
          }
        }
      }

      const options = replay.getOptions();

      // TODO: We want this as an experiment so that we can test
      // internally and create metrics before making this the default
      if (options._experiments.delayFlushOnCheckout) {
        // If the full snapshot is due to an initial load, we will not have
        // a previous session ID. In this case, we want to buffer events
        // for a set amount of time before flushing. This can help avoid
        // capturing replays of users that immediately close the window.
        setTimeout(() => replay.conditionalFlush(), options._experiments.delayFlushOnCheckout);

        // Cancel any previously debounced flushes to ensure there are no [near]
        // simultaneous flushes happening. The latter request should be
        // insignificant in this case, so wait for additional user interaction to
        // trigger a new flush.
        //
        // This can happen because there's no guarantee that a recording event
        // happens first. e.g. a mouse click can happen and trigger a debounced
        // flush before the checkout.
        replay.cancelFlush();

        return true;
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

/**
 * Exported for tests
 */
export function createOptionsEvent(replay: ReplayContainer): RecordingEvent {
  const options = replay.getOptions();
  return {
    type: EventType.Custom,
    timestamp: Date.now(),
    data: {
      tag: 'options',
      payload: {
        sessionSampleRate: options.sessionSampleRate,
        errorSampleRate: options.errorSampleRate,
        useCompressionOption: options.useCompression,
        blockAllMedia: options.blockAllMedia,
        maskAllText: options.maskAllText,
        maskAllInputs: options.maskAllInputs,
        useCompression: replay.eventBuffer ? replay.eventBuffer.type === 'worker' : false,
        networkDetailHasUrls: options.networkDetailAllowUrls.length > 0,
        networkCaptureBodies: options.networkCaptureBodies,
        networkRequestHasHeaders: options.networkRequestHeaders.length > 0,
        networkResponseHasHeaders: options.networkResponseHeaders.length > 0,
      },
    },
  };
}

/**
 * Add a "meta" event that contains a simplified view on current configuration
 * options. This should only be included on the first segment of a recording.
 */
function addSettingsEvent(replay: ReplayContainer, isCheckout?: boolean): Promise<AddEventResult | null> {
  // Only need to add this event when sending the first segment
  if (!isCheckout || !replay.session || replay.session.segmentId !== 0) {
    return Promise.resolve(null);
  }

  return addEvent(replay, createOptionsEvent(replay), false);
}
