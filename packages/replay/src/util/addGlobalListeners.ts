import type { BaseClient } from '@sentry/core';
import { addGlobalEventProcessor, getCurrentHub } from '@sentry/core';
import { addInstrumentationHandler } from '@sentry/utils';

import { handleAfterSendError } from '../coreHandlers/handleAfterSendError';
import { handleDomListener } from '../coreHandlers/handleDom';
import { handleFetchSpanListener } from '../coreHandlers/handleFetch';
import { handleGlobalEventListener } from '../coreHandlers/handleGlobalEvent';
import { handleHistorySpanListener } from '../coreHandlers/handleHistory';
import { handleScopeListener } from '../coreHandlers/handleScope';
import { handleXhrSpanListener } from '../coreHandlers/handleXhr';
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
  addInstrumentationHandler('fetch', handleFetchSpanListener(replay));
  addInstrumentationHandler('xhr', handleXhrSpanListener(replay));
  addInstrumentationHandler('history', handleHistorySpanListener(replay));

  // If a custom client has no hooks yet, we continue to use the "old" implementation
  const hasHooks = !!(client && client.on);

  // Tag all (non replay) events that get sent to Sentry with the current
  // replay ID so that we can reference them later in the UI
  addGlobalEventProcessor(handleGlobalEventListener(replay, !hasHooks));

  if (hasHooks) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client as BaseClient<any>).on('afterSendErrorEvent', handleAfterSendError(replay));
  }
}
