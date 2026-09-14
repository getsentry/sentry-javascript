import type { Client } from '@sentry/core';
import { WINDOW } from '@sentry/react';
import { appRouterInstrumentNavigation, appRouterInstrumentPageLoad } from './appRouterRoutingInstrumentation';
import { pagesRouterInstrumentNavigation } from './pagesRouterNavigationInstrumentation';
import { pagesRouterInstrumentPageLoad } from './pagesRouterRoutingInstrumentation';

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
  } else if (process.env._sentryHasPagesRouter !== 'false') {
    // `withSentryConfig` inlines `'false'` for App Router-only projects, so bundlers drop this module and its
    // `next/router` import (the whole Pages Router runtime). Pageload stays: App Router builds still serve
    // `404.html`/`500.html` through the Pages Router, and it does not need `next/router`.
    pagesRouterInstrumentNavigation(client);
  }
}
