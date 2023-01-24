import { addGlobalEventProcessor, getCurrentHub } from '@sentry/core';
import { addInstrumentationHandler } from '@sentry/utils';

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
  if (scope) {
    scope.addScopeListener(handleScopeListener(replay));
  }
  addInstrumentationHandler('dom', handleDomListener(replay));
  addInstrumentationHandler('fetch', handleFetchSpanListener(replay));
  addInstrumentationHandler('xhr', handleXhrSpanListener(replay));
  addInstrumentationHandler('history', handleHistorySpanListener(replay));

  // Tag all (non replay) events that get sent to Sentry with the current
  // replay ID so that we can reference them later in the UI
  addGlobalEventProcessor(handleGlobalEventListener(replay));
}
