import type { Client, Span, SpanAttributes } from '@sentry/core';
import {
  browserPerformanceTimeOrigin,
  debug,
  getActiveSpan,
  getCurrentScope,
  getRootSpan,
  htmlTreeAsString,
  SEMANTIC_ATTRIBUTE_EXCLUSIVE_TIME,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  spanToStreamedSpanJSON,
  startInactiveSpan,
  timestampInSeconds,
} from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';
import { WINDOW } from '../types';
import { getCachedInteractionContext, INP_ENTRY_MAP, MAX_PLAUSIBLE_INP_DURATION } from './inp';
import type { InstrumentationHandlerCallback } from './instrument';
import { addClsInstrumentationHandler, addInpInstrumentationHandler, addLcpInstrumentationHandler } from './instrument';
import { isValidLcpMetric } from './lcp';
import type { WebVitalReportEvent } from './utils';
import { getBrowserPerformanceAPI, listenForWebVitalReportEvents, msToSec, supportsWebVital } from './utils';
import type { PerformanceEventTiming } from './instrument';

// Locally-defined interfaces to avoid leaking bare global type references into the
// generated .d.ts. The `declare global` augmentations in web-vitals/types.ts make these
// available during this package's compilation but are NOT carried to consumers.
// This mirrors the pattern used for PerformanceEventTiming in instrument.ts.
export interface LayoutShift extends PerformanceEntry {
  value: number;
  sources: Array<{ node: Node | null }>;
  hadRecentInput: boolean;
}

export interface LargestContentfulPaint extends PerformanceEntry {
  readonly renderTime: DOMHighResTimeStamp;
  readonly loadTime: DOMHighResTimeStamp;
  readonly size: number;
  readonly id: string;
  readonly url: string;
  readonly element: Element | null;
}

interface WebVitalSpanOptions {
  name: string;
  op: string;
  origin: string;
  metricName: 'lcp' | 'cls' | 'inp';
  value: number;
  attributes?: SpanAttributes;
  parentSpan?: Span;
  reportEvent?: WebVitalReportEvent;
  startTime: number;
  endTime?: number;
}

/**
 * Emits a web vital span that flows through the span streaming pipeline.
 */
export function _emitWebVitalSpan(options: WebVitalSpanOptions): void {
  const {
    name,
    op,
    origin,
    metricName,
    value,
    attributes: passedAttributes,
    parentSpan,
    reportEvent,
    startTime,
    endTime,
  } = options;

  const routeName = getCurrentScope().getScopeData().transactionName;

  const attributes: SpanAttributes = {
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: origin,
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: op,
    [SEMANTIC_ATTRIBUTE_EXCLUSIVE_TIME]: 0,
    [`browser.web_vital.${metricName}.value`]: value,
    'sentry.transaction': routeName,
    // Web vital score calculation relies on the user agent
    'user_agent.original': WINDOW.navigator?.userAgent,
    ...passedAttributes,
  };

  if (parentSpan && spanToStreamedSpanJSON(parentSpan).attributes?.[SEMANTIC_ATTRIBUTE_SENTRY_OP] === 'pageload') {
    // for LCP and CLS, we collect the pageload span id as an attribute
    attributes['sentry.pageload.span_id'] = parentSpan.spanContext().spanId;
  }

  if (reportEvent) {
    attributes[`browser.web_vital.${metricName}.report_event`] = reportEvent;
  }

  const span = startInactiveSpan({
    name,
    attributes,
    startTime,
    // if we have a pageload span, we let the web vital span start as its parent. This ensures that
    // it is not started as a segment span, without having to manually set it to a "standalone" v2 span
    // that has `segment: false` but no actual parent span.
    parentSpan: parentSpan,
  });

  if (span) {
    span.end(endTime ?? startTime);
  }
}

/**
 * Tracks LCP as a streamed span.
 */
export function trackLcpAsSpan(client: Client): void {
  let lcpValue = 0;
  let lcpEntry: LargestContentfulPaint | undefined;

  if (!supportsWebVital('largest-contentful-paint')) {
    return;
  }

  const cleanupLcpHandler = addLcpInstrumentationHandler(({ metric }) => {
    const entry = metric.entries[metric.entries.length - 1] as LargestContentfulPaint | undefined;
    if (!entry || !isValidLcpMetric(metric.value)) {
      return;
    }
    lcpValue = metric.value;
    lcpEntry = entry;
  }, true);

  listenForWebVitalReportEvents(client, (reportEvent, _, pageloadSpan) => {
    _sendLcpSpan(lcpValue, lcpEntry, pageloadSpan, reportEvent);
    cleanupLcpHandler();
  });
}

/**
 * Exported only for testing.
 */
export function _sendLcpSpan(
  lcpValue: number,
  entry: LargestContentfulPaint | undefined,
  pageloadSpan?: Span,
  reportEvent?: WebVitalReportEvent,
): void {
  if (!isValidLcpMetric(lcpValue)) {
    return;
  }

  DEBUG_BUILD && debug.log(`Sending LCP span (${lcpValue})`);

  const performanceTimeOrigin = browserPerformanceTimeOrigin() || 0;
  const timeOrigin = msToSec(performanceTimeOrigin);
  const endTime = msToSec(performanceTimeOrigin + (entry?.startTime || 0));
  const name = entry ? htmlTreeAsString(entry.element) : 'Largest contentful paint';

  const attributes: SpanAttributes = {};

  entry?.element && (attributes['browser.web_vital.lcp.element'] = htmlTreeAsString(entry.element));
  entry?.id && (attributes['browser.web_vital.lcp.id'] = entry.id);
  entry?.url && (attributes['browser.web_vital.lcp.url'] = entry.url);
  entry?.loadTime != null && (attributes['browser.web_vital.lcp.load_time'] = entry.loadTime);
  entry?.renderTime != null && (attributes['browser.web_vital.lcp.render_time'] = entry.renderTime);
  entry?.size != null && (attributes['browser.web_vital.lcp.size'] = entry.size);

  _emitWebVitalSpan({
    name,
    op: 'ui.webvital.lcp',
    origin: 'auto.http.browser.lcp',
    metricName: 'lcp',
    value: lcpValue,
    attributes,
    parentSpan: pageloadSpan,
    reportEvent,
    startTime: timeOrigin,
    endTime,
  });
}

/**
 * Tracks CLS as a streamed span.
 */
export function trackClsAsSpan(client: Client): void {
  let clsValue = 0;
  let clsEntry: LayoutShift | undefined;

  if (!supportsWebVital('layout-shift')) {
    return;
  }

  const cleanupClsHandler = addClsInstrumentationHandler(({ metric }) => {
    const entry = metric.entries[metric.entries.length - 1] as LayoutShift | undefined;
    if (!entry) {
      return;
    }
    clsValue = metric.value;
    clsEntry = entry;
  }, true);

  listenForWebVitalReportEvents(client, (reportEvent, _, pageloadSpan) => {
    _sendClsSpan(clsValue, clsEntry, pageloadSpan, reportEvent);
    cleanupClsHandler();
  });
}

/**
 * Exported only for testing.
 */
export function _sendClsSpan(
  clsValue: number,
  entry: LayoutShift | undefined,
  pageloadSpan?: Span,
  reportEvent?: WebVitalReportEvent,
): void {
  DEBUG_BUILD && debug.log(`Sending CLS span (${clsValue})`);

  const startTime = entry ? msToSec((browserPerformanceTimeOrigin() || 0) + entry.startTime) : timestampInSeconds();
  const name = entry ? htmlTreeAsString(entry.sources[0]?.node) : 'Layout shift';

  const attributes: SpanAttributes = {};

  if (entry?.sources) {
    entry.sources.forEach((source, index) => {
      attributes[`browser.web_vital.cls.source.${index + 1}`] = htmlTreeAsString(source.node);
    });
  }

  _emitWebVitalSpan({
    name,
    op: 'ui.webvital.cls',
    origin: 'auto.http.browser.cls',
    metricName: 'cls',
    value: clsValue,
    attributes,
    parentSpan: pageloadSpan,
    reportEvent,
    startTime,
  });
}

/**
 * Tracks INP as a streamed span.
 *
 * This mirrors the standalone INP tracking logic (`startTrackingINP`) but emits
 * spans through the streaming pipeline instead of as standalone spans.
 * Requires `registerInpInteractionListener()` to be called separately for
 * cached element names and root spans per interaction.
 */
export function trackInpAsSpan(): void {
  const performance = getBrowserPerformanceAPI();
  if (!performance || !browserPerformanceTimeOrigin()) {
    return;
  }

  const onInp: InstrumentationHandlerCallback = ({ metric }) => {
    if (metric.value == null) {
      return;
    }

    const duration = msToSec(metric.value);

    if (duration > MAX_PLAUSIBLE_INP_DURATION) {
      return;
    }

    const entry = metric.entries.find(e => e.duration === metric.value && INP_ENTRY_MAP[e.name]);

    if (!entry) {
      return;
    }

    _sendInpSpan(metric.value, entry);
  };

  addInpInstrumentationHandler(onInp);
}

/**
 * Exported only for testing.
 */
export function _sendInpSpan(inpValue: number, entry: PerformanceEventTiming): void {
  DEBUG_BUILD && debug.log(`Sending INP span (${inpValue})`);

  const startTime = msToSec((browserPerformanceTimeOrigin() as number) + entry.startTime);
  const duration = msToSec(inpValue);
  const interactionType = INP_ENTRY_MAP[entry.name];

  const cachedContext = getCachedInteractionContext(entry.interactionId);
  const activeSpan = getActiveSpan();
  const rootSpan = activeSpan ? getRootSpan(activeSpan) : undefined;

  const spanToUse = cachedContext?.span || rootSpan;
  const routeName = spanToUse
    ? spanToStreamedSpanJSON(spanToUse).name
    : getCurrentScope().getScopeData().transactionName;
  const name = cachedContext?.elementName || htmlTreeAsString(entry.target);

  _emitWebVitalSpan({
    name,
    op: `ui.interaction.${interactionType}`,
    origin: 'auto.http.browser.inp',
    metricName: 'inp',
    value: inpValue,
    attributes: {
      [SEMANTIC_ATTRIBUTE_EXCLUSIVE_TIME]: entry.duration,
      'sentry.transaction': routeName,
    },
    startTime,
    endTime: startTime + duration,
    parentSpan: spanToUse,
  });
}
