import type { BaseClient } from '@sentry/core';
import { addGlobalEventProcessor, getCurrentHub } from '@sentry/core';
import type { Client, DynamicSamplingContext } from '@sentry/types';
import { addInstrumentationHandler } from '@sentry/utils';

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
  const client = getCurrentHub().getClient();

  if (scope) {
    scope.addScopeListener(handleScopeListener(replay));
  }
  addInstrumentationHandler('dom', handleDomListener(replay));
  addInstrumentationHandler('history', handleHistorySpanListener(replay));
  handleNetworkBreadcrumbs(replay);

  // Tag all (non replay) events that get sent to Sentry with the current
  // replay ID so that we can reference them later in the UI
  addGlobalEventProcessor(handleGlobalEventListener(replay, !hasHooks(client)));

  // If a custom client has no hooks yet, we continue to use the "old" implementation
  if (hasHooks(client)) {
    client.on('afterSendEvent', handleAfterSendEvent(replay));
    client.on('createDsc', (dsc: DynamicSamplingContext) => {
      const replayId = replay.getSessionId();
      if (replayId && replay.isEnabled()) {
        dsc.replay_id = replayId;
      }
    });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function hasHooks(client: Client | undefined): client is BaseClient<any> {
  return !!(client && client.on);
}
