import type { BaseClient } from '@sentry/core';
import { addEventProcessor, getClient, getCurrentHub } from '@sentry/core';
import type { Client, DynamicSamplingContext } from '@sentry/types';
import { addClickKeypressInstrumentationHandler, addHistoryInstrumentationHandler } from '@sentry/utils';

import { handleAfterSendEvent } from '../coreHandlers/handleAfterSendEvent';
import { handleDomListener } from '../coreHandlers/handleDom';
import { handleGlobalEventListener } from '../coreHandlers/handleGlobalEvent';
import { handleHistorySpanListener } from '../coreHandlers/handleHistory';
import { handleNetworkBreadcrumbs } from '../coreHandlers/handleNetworkBreadcrumbs';
import { handleScopeListener } from '../coreHandlers/handleScope';
import type { ReplayContainer } from '../types';

/**
 * Add global listeners that cannot be removed.
 */
export function addGlobalListeners(replay: ReplayContainer): void {
  // Listeners from core SDK //
  const scope = getCurrentHub().getScope();
  const client = getClient();

  scope.addScopeListener(handleScopeListener(replay));
  addClickKeypressInstrumentationHandler(handleDomListener(replay));
  addHistoryInstrumentationHandler(handleHistorySpanListener(replay));
  handleNetworkBreadcrumbs(replay);

  // Tag all (non replay) events that get sent to Sentry with the current
  // replay ID so that we can reference them later in the UI
  const eventProcessor = handleGlobalEventListener(replay, !hasHooks(client));
  if (client && client.addEventProcessor) {
    client.addEventProcessor(eventProcessor);
  } else {
    addEventProcessor(eventProcessor);
  }

  // If a custom client has no hooks yet, we continue to use the "old" implementation
  if (hasHooks(client)) {
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

    client.on('startTransaction', transaction => {
      replay.lastTransaction = transaction;
    });

    // We may be missing the initial startTransaction due to timing issues,
    // so we capture it on finish again.
    client.on('finishTransaction', transaction => {
      replay.lastTransaction = transaction;
    });

    // We want to flush replay
    client.on('beforeSendFeedback', (feedbackEvent, options) => {
      const replayId = replay.getSessionId();
      if (options && options.includeReplay && replay.isEnabled() && replayId) {
        void replay.flush();
        if (feedbackEvent.contexts && feedbackEvent.contexts.feedback) {
          feedbackEvent.contexts.feedback.replay_id = replayId;
        }
      }
    });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function hasHooks(client: Client | undefined): client is BaseClient<any> {
  return !!(client && client.on);
}
