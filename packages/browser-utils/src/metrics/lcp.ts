import type { Client, SpanAttributes } from '@sentry/core';
import {
  browserPerformanceTimeOrigin,
  debug,
  getCurrentScope,
  htmlTreeAsString,
  SEMANTIC_ATTRIBUTE_EXCLUSIVE_TIME,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  startInactiveSpan,
} from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';
import { WINDOW } from '../types';
import { addLcpInstrumentationHandler } from './instrument';
import type { WebVitalReportEvent } from './utils';
import { listenForWebVitalReportEvents, msToSec, supportsWebVital } from './utils';

/**
 * Starts tracking the Largest Contentful Paint on the current page and collects the value once
 *
 * - the page visibility is hidden
 * - a navigation span is started (to stop LCP measurement for SPA soft navigations)
 *
 * Once either of these events triggers, the LCP value is sent as a standalone span and we stop
 * measuring LCP for subsequent routes.
 */
export function trackLcpAsStandaloneSpan(client: Client): void {
  let standaloneLcpValue = 0;
  let standaloneLcpEntry: LargestContentfulPaint | undefined;

  if (!supportsWebVital('largest-contentful-paint')) {
    return;
  }

  const cleanupLcpHandler = addLcpInstrumentationHandler(({ metric }) => {
    const entry = metric.entries[metric.entries.length - 1] as LargestContentfulPaint | undefined;
    if (!entry) {
      return;
    }
    standaloneLcpValue = metric.value;
    standaloneLcpEntry = entry;
  }, true);

  listenForWebVitalReportEvents(client, (reportEvent, pageloadSpanId) => {
    _sendStandaloneLcpSpan(standaloneLcpValue, standaloneLcpEntry, pageloadSpanId, reportEvent);
    cleanupLcpHandler();
  });
}

/**
 * Exported only for testing!
 */
export function _sendStandaloneLcpSpan(
  lcpValue: number,
  entry: LargestContentfulPaint | undefined,
  pageloadSpanId: string,
  reportEvent: WebVitalReportEvent,
) {
  DEBUG_BUILD && debug.log(`Sending LCP span (${lcpValue})`);

  const startTime = msToSec((browserPerformanceTimeOrigin() || 0) + (entry?.startTime || 0));
  const routeName = getCurrentScope().getScopeData().transactionName;

  const name = entry ? htmlTreeAsString(entry.element) : 'Largest contentful paint';

  const attributes: SpanAttributes = {
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.browser.lcp',
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'ui.webvital.lcp',
    [SEMANTIC_ATTRIBUTE_EXCLUSIVE_TIME]: 0, // LCP is a point-in-time metric
    // attach the pageload span id to the LCP span so that we can link them in the UI
    'sentry.pageload.span_id': pageloadSpanId,
    // describes what triggered the web vital to be reported
    'sentry.report_event': reportEvent,

    // TODO: Relay currently expects 'lcp', but we should consider 'lcp.value'
    'lcp': lcpValue,
    'lcp.value': lcpValue,

    'lcp.element': entry?.element ? htmlTreeAsString(entry.element) : undefined,
    'lcp.id': entry?.id,
    'lcp.url': entry?.url,
    'lcp.loadTime': entry?.loadTime,
    'lcp.renderTime': entry?.renderTime,
    'lcp.size': entry?.size,

    transaction: routeName,

    // Web vital score calculation relies on the user agent to account for different
    // browsers setting different thresholds for what is considered a good/meh/bad value.
    // For example: Chrome vs. Chrome Mobile
    'user_agent.original': WINDOW.navigator?.userAgent,
  };

  startInactiveSpan({
    name,
    attributes,
    startTime,
  })?.end(startTime);
}
