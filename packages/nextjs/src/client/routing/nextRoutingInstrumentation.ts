import { WINDOW } from '@sentry/react';
import type { StartSpanOptions } from '@sentry/types';

import { appRouterInstrumentation } from './appRouterRoutingInstrumentation';
import { pagesRouterInstrumentation } from './pagesRouterRoutingInstrumentation';

type StartSpanCb = (context: StartSpanOptions) => void;

/**
 * Instruments the Next.js Client Router.
 */
export function nextRouterInstrumentation(
  shouldInstrumentPageload: boolean,
  shouldInstrumentNavigation: boolean,
  startPageloadSpanCallback: StartSpanCb,
  startNavigationSpanCallback: StartSpanCb,
): void {
  const isAppRouter = !WINDOW.document.getElementById('__NEXT_DATA__');
  if (isAppRouter) {
    appRouterInstrumentation(
      shouldInstrumentPageload,
      shouldInstrumentNavigation,
      startPageloadSpanCallback,
      startNavigationSpanCallback,
    );
  } else {
    pagesRouterInstrumentation(
      shouldInstrumentPageload,
      shouldInstrumentNavigation,
      startPageloadSpanCallback,
      startNavigationSpanCallback,
    );
  }
}
