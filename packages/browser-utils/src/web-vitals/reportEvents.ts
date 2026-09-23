import type { Client, Span } from '@sentry/core';
import { onHidden } from './utils';

/**
 * Listens for events on which we want to collect a previously accumulated web vital value.
 * Currently, this includes:
 *
 * - pagehide (i.e. user minimizes browser window, hides tab, etc)
 * - soft navigation (we only care about the vital of the initially loaded route)
 *
 * As a "side-effect", this function will also collect the pageload span.
 *
 * @param collectorCallback the callback to be called when the first of these events is triggered. It is passed the
 * pageload span, which the web vital span is parented to.
 */
export function listenForWebVitalReportEvents(client: Client, collectorCallback: (pageloadSpan: Span) => void) {
  let pageloadSpan: Span | undefined;

  let collected = false;
  function _runCollectorCallbackOnce() {
    if (!collected && pageloadSpan) {
      collectorCallback(pageloadSpan);
    }
    collected = true;
  }

  onHidden(() => {
    _runCollectorCallbackOnce();
  });

  const unsubscribeStartNavigation = client.on('beforeStartNavigationSpan', (_, options) => {
    // we only want to collect LCP if we actually navigate. Redirects should be ignored.
    if (!options?.isRedirect) {
      _runCollectorCallbackOnce();
      unsubscribeStartNavigation();
      unsubscribeAfterStartPageLoadSpan();
    }
  });

  const unsubscribeAfterStartPageLoadSpan = client.on('afterStartPageLoadSpan', span => {
    pageloadSpan = span;
    unsubscribeAfterStartPageLoadSpan();
  });
}
