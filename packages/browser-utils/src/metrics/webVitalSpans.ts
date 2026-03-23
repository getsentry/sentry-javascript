import type { Client, SpanAttributes } from '@sentry/core';
import {
  browserPerformanceTimeOrigin,
  debug,
  getActiveSpan,
  getCurrentScope,
  getRootSpan,
  htmlTreeAsString,
  SEMANTIC_ATTRIBUTE_EXCLUSIVE_TIME,
  SEMANTIC_ATTRIBUTE_SENTRY_MEASUREMENT_UNIT,
  SEMANTIC_ATTRIBUTE_SENTRY_MEASUREMENT_VALUE,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  spanToJSON,
  startInactiveSpan,
  timestampInSeconds,
} from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';
import { WINDOW } from '../types';
import { INP_ENTRY_MAP } from './inp';
import type { InstrumentationHandlerCallback } from './instrument';
import { addClsInstrumentationHandler, addInpInstrumentationHandler, addLcpInstrumentationHandler } from './instrument';
import { listenForWebVitalReportEvents, msToSec, supportsWebVital } from './utils';

// Maximum plausible INP duration in seconds (matches standalone INP handler)
const MAX_PLAUSIBLE_INP_DURATION = 60;

interface WebVitalSpanOptions {
  name: string;
  op: string;
  origin: string;
  metricName: string;
  value: number;
  unit: string;
  attributes?: SpanAttributes;
  pageloadSpanId?: string;
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
    unit,
    attributes: passedAttributes,
    pageloadSpanId,
    startTime,
    endTime,
  } = options;

  const routeName = getCurrentScope().getScopeData().transactionName;

  const attributes: SpanAttributes = {
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: origin,
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: op,
    [SEMANTIC_ATTRIBUTE_EXCLUSIVE_TIME]: 0,
    [`browser.web_vital.${metricName}.value`]: value,
    transaction: routeName,
    // Web vital score calculation relies on the user agent
    'user_agent.original': WINDOW.navigator?.userAgent,
    ...passedAttributes,
  };

  if (pageloadSpanId) {
    attributes['sentry.pageload.span_id'] = pageloadSpanId;
  }

  const span = startInactiveSpan({
    name,
    attributes,
    startTime,
  });

  if (span) {
    span.addEvent(metricName, {
      [SEMANTIC_ATTRIBUTE_SENTRY_MEASUREMENT_UNIT]: unit,
      [SEMANTIC_ATTRIBUTE_SENTRY_MEASUREMENT_VALUE]: value,
    });

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
    if (!entry) {
      return;
    }
    lcpValue = metric.value;
    lcpEntry = entry;
  }, true);

  listenForWebVitalReportEvents(client, (_reportEvent, pageloadSpanId) => {
    _sendLcpSpan(lcpValue, lcpEntry, pageloadSpanId);
    cleanupLcpHandler();
  });
}

/**
 * Exported only for testing.
 */
export function _sendLcpSpan(
  lcpValue: number,
  entry: LargestContentfulPaint | undefined,
  pageloadSpanId: string,
): void {
  DEBUG_BUILD && debug.log(`Sending LCP span (${lcpValue})`);

  const timeOrigin = msToSec(browserPerformanceTimeOrigin() || 0);
  const endTime = msToSec((browserPerformanceTimeOrigin() || 0) + (entry?.startTime || 0));
  const name = entry ? htmlTreeAsString(entry.element) : 'Largest contentful paint';

  const attributes: SpanAttributes = {};

  if (entry) {
    entry.element && (attributes['browser.web_vital.lcp.element'] = htmlTreeAsString(entry.element));
    entry.id && (attributes['browser.web_vital.lcp.id'] = entry.id);
    entry.url && (attributes['browser.web_vital.lcp.url'] = entry.url);
    entry.loadTime != null && (attributes['browser.web_vital.lcp.load_time'] = entry.loadTime);
    entry.renderTime != null && (attributes['browser.web_vital.lcp.render_time'] = entry.renderTime);
    entry.size != null && (attributes['browser.web_vital.lcp.size'] = entry.size);
  }

  _emitWebVitalSpan({
    name,
    op: 'ui.webvital.lcp',
    origin: 'auto.http.browser.lcp',
    metricName: 'lcp',
    value: lcpValue,
    unit: 'millisecond',
    attributes,
    pageloadSpanId,
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

  listenForWebVitalReportEvents(client, (_reportEvent, pageloadSpanId) => {
    _sendClsSpan(clsValue, clsEntry, pageloadSpanId);
    cleanupClsHandler();
  });
}

/**
 * Exported only for testing.
 */
export function _sendClsSpan(clsValue: number, entry: LayoutShift | undefined, pageloadSpanId: string): void {
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
    unit: '',
    attributes,
    pageloadSpanId,
    startTime,
  });
}

/**
 * Tracks INP as a streamed span.
 */
export function trackInpAsSpan(_client: Client): void {
  const onInp: InstrumentationHandlerCallback = ({ metric }) => {
    if (metric.value == null) {
      return;
    }

    // Guard against unrealistically long INP values (matching standalone INP handler)
    if (msToSec(metric.value) > MAX_PLAUSIBLE_INP_DURATION) {
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
export function _sendInpSpan(
  inpValue: number,
  entry: { name: string; startTime: number; duration: number; target?: unknown | null },
): void {
  DEBUG_BUILD && debug.log(`Sending INP span (${inpValue})`);

  const startTime = msToSec((browserPerformanceTimeOrigin() as number) + entry.startTime);
  const interactionType = INP_ENTRY_MAP[entry.name];
  const activeSpan = getActiveSpan();
  const rootSpan = activeSpan ? getRootSpan(activeSpan) : undefined;
  const routeName = rootSpan ? spanToJSON(rootSpan).description : getCurrentScope().getScopeData().transactionName;
  const name = htmlTreeAsString(entry.target);

  _emitWebVitalSpan({
    name,
    op: `ui.interaction.${interactionType}`,
    origin: 'auto.http.browser.inp',
    metricName: 'inp',
    value: inpValue,
    unit: 'millisecond',
    attributes: {
      [SEMANTIC_ATTRIBUTE_EXCLUSIVE_TIME]: entry.duration,
      transaction: routeName,
    },
    startTime,
    endTime: startTime + msToSec(entry.duration),
  });
}
