import type { SpanAttributes } from '@sentry/core';
import {
  browserPerformanceTimeOrigin,
  getActiveSpan,
  getClient,
  getCurrentScope,
  getRootSpan,
  htmlTreeAsString,
  logger,
  SEMANTIC_ATTRIBUTE_EXCLUSIVE_TIME,
  SEMANTIC_ATTRIBUTE_SENTRY_MEASUREMENT_UNIT,
  SEMANTIC_ATTRIBUTE_SENTRY_MEASUREMENT_VALUE,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  spanToJSON,
} from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';
import { addLcpInstrumentationHandler } from './instrument';
import { msToSec, startStandaloneWebVitalSpan } from './utils';
import { onHidden } from './web-vitals/lib/onHidden';

/**
 * Starts tracking the Largest Contentful Paint on the current page and collects the value once
 *
 * - the page visibility is hidden
 * - a navigation span is started (to stop LCP measurement for SPA soft navigations)
 *
 * Once either of these events triggers, the LCP value is sent as a standalone span and we stop
 * measuring LCP for subsequent routes.
 */
export function trackLcpAsStandaloneSpan(): void {
  let standaloneLcpValue = 0;
  let standaloneLcpEntry: LargestContentfulPaint | undefined;
  let pageloadSpanId: string | undefined;

  if (!supportsLargestContentfulPaint()) {
    return;
  }

  let sentSpan = false;
  function _collectLcpOnce() {
    if (sentSpan) {
      return;
    }
    sentSpan = true;
    if (pageloadSpanId) {
      sendStandaloneLcpSpan(standaloneLcpValue, standaloneLcpEntry, pageloadSpanId);
    }
    cleanupLcpHandler();
  }

  const cleanupLcpHandler = addLcpInstrumentationHandler(({ metric }) => {
    const entry = metric.entries[metric.entries.length - 1] as LargestContentfulPaint | undefined;
    if (!entry) {
      return;
    }
    standaloneLcpValue = metric.value;
    standaloneLcpEntry = entry;
  }, true);

  // TODO: Figure out if we can switch to using whenIdleOrHidden instead of onHidden
  // use pagehide event from web-vitals
  onHidden(() => {
    _collectLcpOnce();
  });

  // Since the call chain of this function is synchronous and evaluates before the SDK client is created,
  // we need to wait with subscribing to a client hook until the client is created. Therefore, we defer
  // to the next tick after the SDK setup.
  setTimeout(() => {
    const client = getClient();

    if (!client) {
      return;
    }

    const unsubscribeStartNavigation = client.on('startNavigationSpan', () => {
      _collectLcpOnce();
      unsubscribeStartNavigation?.();
    });

    const activeSpan = getActiveSpan();
    if (activeSpan) {
      const rootSpan = getRootSpan(activeSpan);
      const spanJSON = spanToJSON(rootSpan);
      if (spanJSON.op === 'pageload') {
        pageloadSpanId = rootSpan.spanContext().spanId;
      }
    }
  }, 0);
}

function sendStandaloneLcpSpan(lcpValue: number, entry: LargestContentfulPaint | undefined, pageloadSpanId: string) {
  DEBUG_BUILD && logger.log(`Sending LCP span (${lcpValue})`);

  const startTime = msToSec((browserPerformanceTimeOrigin() || 0) + (entry?.startTime || 0));
  const routeName = getCurrentScope().getScopeData().transactionName;

  const name = entry ? htmlTreeAsString(entry.element) : 'Largest contentful paint';

  const attributes: SpanAttributes = {
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.browser.lcp',
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'ui.webvital.lcp',
    [SEMANTIC_ATTRIBUTE_EXCLUSIVE_TIME]: 0, // LCP is a point-in-time metric
    // attach the pageload span id to the LCP span so that we can link them in the UI
    'sentry.pageload.span_id': pageloadSpanId,
  };

  if (entry) {
    attributes['lcp.element'] = htmlTreeAsString(entry.element);
    attributes['lcp.id'] = entry.id;
    attributes['lcp.url'] = entry.url;
    attributes['lcp.loadTime'] = entry.loadTime;
    attributes['lcp.renderTime'] = entry.renderTime;
    attributes['lcp.size'] = entry.size;
  }

  const span = startStandaloneWebVitalSpan({
    name,
    transaction: routeName,
    attributes,
    startTime,
  });

  if (span) {
    span.addEvent('lcp', {
      [SEMANTIC_ATTRIBUTE_SENTRY_MEASUREMENT_UNIT]: 'millisecond',
      [SEMANTIC_ATTRIBUTE_SENTRY_MEASUREMENT_VALUE]: lcpValue,
    });

    // LCP is a point-in-time metric, so we end the span immediately
    span.end(startTime);
  }
}

function supportsLargestContentfulPaint(): boolean {
  try {
    return PerformanceObserver.supportedEntryTypes.includes('largest-contentful-paint');
  } catch {
    return false;
  }
}
