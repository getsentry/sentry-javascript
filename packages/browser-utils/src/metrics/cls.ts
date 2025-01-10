import {
  SEMANTIC_ATTRIBUTE_EXCLUSIVE_TIME,
  SEMANTIC_ATTRIBUTE_SENTRY_MEASUREMENT_UNIT,
  SEMANTIC_ATTRIBUTE_SENTRY_MEASUREMENT_VALUE,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  getActiveSpan,
  getClient,
  getCurrentScope,
  getRootSpan,
  spanToJSON,
} from '@sentry/core';
import { browserPerformanceTimeOrigin, dropUndefinedKeys, htmlTreeAsString, logger } from '@sentry/core';
import type { SpanAttributes } from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';
import { addClsInstrumentationHandler } from './instrument';
import { msToSec, startStandaloneWebVitalSpan } from './utils';
import { onHidden } from './web-vitals/lib/onHidden';

/**
 * Starts tracking the Cumulative Layout Shift on the current page and collects the value once
 *
 * - the page visibility is hidden
 * - a navigation span is started (to stop CLS measurement for SPA soft navigations)
 *
 * Once either of these events triggers, the CLS value is sent as a standalone span and we stop
 * measuring CLS.
 */
export function trackClsAsStandaloneSpan(): void {
  let standaloneCLsValue = 0;
  let standaloneClsEntry: LayoutShift | undefined;
  let pageloadSpanId: string | undefined;

  if (!supportsLayoutShift()) {
    return;
  }

  let sentSpan = false;
  function _collectClsOnce() {
    if (sentSpan) {
      return;
    }
    sentSpan = true;
    if (pageloadSpanId) {
      sendStandaloneClsSpan(standaloneCLsValue, standaloneClsEntry, pageloadSpanId);
    }
    cleanupClsHandler();
  }

  const cleanupClsHandler = addClsInstrumentationHandler(({ metric }) => {
    const entry = metric.entries[metric.entries.length - 1] as LayoutShift | undefined;
    if (!entry) {
      return;
    }
    standaloneCLsValue = metric.value;
    standaloneClsEntry = entry;
  }, true);

  // use pagehide event from web-vitals
  onHidden(() => {
    _collectClsOnce();
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
      _collectClsOnce();
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

function sendStandaloneClsSpan(clsValue: number, entry: LayoutShift | undefined, pageloadSpanId: string) {
  DEBUG_BUILD && logger.log(`Sending CLS span (${clsValue})`);

  const startTime = msToSec((browserPerformanceTimeOrigin() || 0) + (entry?.startTime || 0));
  const routeName = getCurrentScope().getScopeData().transactionName;

  const name = entry ? htmlTreeAsString(entry.sources[0]?.node) : 'Layout shift';

  const attributes: SpanAttributes = dropUndefinedKeys({
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.browser.cls',
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'ui.webvital.cls',
    [SEMANTIC_ATTRIBUTE_EXCLUSIVE_TIME]: entry?.duration || 0,
    // attach the pageload span id to the CLS span so that we can link them in the UI
    'sentry.pageload.span_id': pageloadSpanId,
  });

  const span = startStandaloneWebVitalSpan({
    name,
    transaction: routeName,
    attributes,
    startTime,
  });

  if (span) {
    span.addEvent('cls', {
      [SEMANTIC_ATTRIBUTE_SENTRY_MEASUREMENT_UNIT]: '',
      [SEMANTIC_ATTRIBUTE_SENTRY_MEASUREMENT_VALUE]: clsValue,
    });

    // LayoutShift performance entries always have a duration of 0, so we don't need to add `entry.duration` here
    // see: https://developer.mozilla.org/en-US/docs/Web/API/PerformanceEntry/duration
    span.end(startTime);
  }
}

function supportsLayoutShift(): boolean {
  try {
    return PerformanceObserver.supportedEntryTypes.includes('layout-shift');
  } catch {
    return false;
  }
}
