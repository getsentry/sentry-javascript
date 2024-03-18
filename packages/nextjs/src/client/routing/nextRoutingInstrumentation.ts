import { WINDOW } from '@sentry/react';
import type { Client } from '@sentry/types';

import { appRouterInstrumentNavigation, appRouterInstrumentPageLoad } from './appRouterRoutingInstrumentation';
import { pagesRouterInstrumentNavigation, pagesRouterInstrumentPageLoad } from './pagesRouterRoutingInstrumentation';

/**
 * Instruments the Next.js Client Router for page loads.
 */
export function nextRouterInstrumentPageLoad(client: Client): void {
  const isAppRouter = !WINDOW.document.getElementById('__NEXT_DATA__');
  if (isAppRouter) {
    appRouterInstrumentPageLoad(client);
  } else {
    pagesRouterInstrumentPageLoad(client);
  }
}

/**
 * Instruments the Next.js Client Router for navigation.
 */
export function nextRouterInstrumentNavigation(client: Client): void {
  const isAppRouter = !WINDOW.document.getElementById('__NEXT_DATA__');
  if (isAppRouter) {
    appRouterInstrumentNavigation(client);
  } else {
    pagesRouterInstrumentNavigation(client);
  }
}
