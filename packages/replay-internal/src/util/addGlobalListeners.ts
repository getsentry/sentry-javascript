import type { DynamicSamplingContext } from '@sentry/core';
import { addEventProcessor, getClient } from '@sentry/core';
import {
  addClickKeypressInstrumentationHandler,
  addHistoryInstrumentationHandler,
} from '@sentry-internal/browser-utils';
import { handleAfterSendEvent } from '../coreHandlers/handleAfterSendEvent';
import { handleBeforeSendEvent } from '../coreHandlers/handleBeforeSendEvent';
import { handleBreadcrumbs } from '../coreHandlers/handleBreadcrumbs';
import { handleDomListener } from '../coreHandlers/handleDom';
import { handleGlobalEventListener } from '../coreHandlers/handleGlobalEvent';
import { handleHistorySpanListener } from '../coreHandlers/handleHistory';
import { handleNetworkBreadcrumbs } from '../coreHandlers/handleNetworkBreadcrumbs';
import type { ReplayContainer } from '../types';

/**
 * Add global listeners that cannot be removed.
 */
export function addGlobalListeners(replay: ReplayContainer): void {
  // Listeners from core SDK //
  const client = getClient();

  addClickKeypressInstrumentationHandler(handleDomListener(replay));
  addHistoryInstrumentationHandler(handleHistorySpanListener(replay));
  handleBreadcrumbs(replay);
  handleNetworkBreadcrumbs(replay);

  // Tag all (non replay) events that get sent to Sentry with the current
  // replay ID so that we can reference them later in the UI
  const eventProcessor = handleGlobalEventListener(replay);
  addEventProcessor(eventProcessor);

  // If a custom client has no hooks yet, we continue to use the "old" implementation
  if (client) {
    client.on('beforeSendEvent', handleBeforeSendEvent(replay));
    client.on('afterSendEvent', handleAfterSendEvent(replay));
    client.on('createDsc', (dsc: DynamicSamplingContext) => {
      const replayId = replay.getSessionId();
      // We do not want to set the DSC when in buffer mode, as that means the replay has not been sent (yet)
      if (replayId && replay.isEnabled() && replay.recordingMode === 'session') {
        // Ensure to check that the session is still active - it could have expired in the meanwhile
        const isSessionActive = replay.checkAndHandleExpiredSession();
        if (isSessionActive) {
          dsc.replay_id = replayId;
        }
      }
    });

    client.on('spanStart', span => {
      replay.lastActiveSpan = span;
    });

    // We may be missing the initial spanStart due to timing issues,
    // so we capture it on finish again.
    client.on('spanEnd', span => {
      replay.lastActiveSpan = span;
    });

    // We want to attach the replay id to the feedback event
    client.on('beforeSendFeedback', async (feedbackEvent, options) => {
      const replayId = replay.getSessionId();
      if (options?.includeReplay && replay.isEnabled() && replayId && feedbackEvent.contexts?.feedback) {
        // In case the feedback is sent via API and not through our widget, we want to flush replay
        if (feedbackEvent.contexts.feedback.source === 'api') {
          await replay.sendBufferedReplayOrFlush();
        }
        feedbackEvent.contexts.feedback.replay_id = replayId;
      }
    });

    client.on('openFeedbackWidget', async () => {
      await replay.sendBufferedReplayOrFlush();
    });
  }
}
