import type { Client, Span } from '@sentry/core';
import { onHidden } from './utils';

export type WebVitalReportEvent = 'pagehide' | 'navigation';

/**
 * Listens for events on which we want to collect a previously accumulated web vital value.
 * Currently, this includes:
 *
 * - pagehide (i.e. user minimizes browser window, hides tab, etc)
 * - soft navigation (we only care about the vital of the initially loaded route)
 *
 * As a "side-effect", this function will also collect the span id of the pageload span.
 *
 * @param collectorCallback the callback to be called when the first of these events is triggered. Parameters:
 * - event: the event that triggered the reporting of the web vital value.
 * - pageloadSpanId: the span id of the pageload span. This is used to link the web vital span to the pageload span.
 * - pageloadSpan: the pageload span instance. This is used for full access to the pageload span for span streaming.
 */
export function listenForWebVitalReportEvents(
  client: Client,
  collectorCallback: (event: WebVitalReportEvent, pageloadSpanId: string, pageloadSpan?: Span) => void,
) {
  let pageloadSpan: Span | undefined;

  let collected = false;
  function _runCollectorCallbackOnce(event: WebVitalReportEvent) {
    if (!collected && pageloadSpan) {
      collectorCallback(event, pageloadSpan.spanContext().spanId, pageloadSpan);
    }
    collected = true;
  }

  onHidden(() => {
    _runCollectorCallbackOnce('pagehide');
  });

  const unsubscribeStartNavigation = client.on('beforeStartNavigationSpan', (_, options) => {
    // we only want to collect LCP if we actually navigate. Redirects should be ignored.
    if (!options?.isRedirect) {
      _runCollectorCallbackOnce('navigation');
      unsubscribeStartNavigation();
      unsubscribeAfterStartPageLoadSpan();
    }
  });

  const unsubscribeAfterStartPageLoadSpan = client.on('afterStartPageLoadSpan', span => {
    pageloadSpan = span;
    unsubscribeAfterStartPageLoadSpan();
  });
}
