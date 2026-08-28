import type { Client, Span, SpanAttributes } from '@sentry/core';
import {
  browserPerformanceTimeOrigin,
  debug,
  getActiveSpan,
  getRootSpan,
  hasSpanStreamingEnabled,
  SEMANTIC_ATTRIBUTE_EXCLUSIVE_TIME,
  timestampInSeconds,
} from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';
import { htmlTreeAsString } from '../htmlTreeAsString';
import type { InteractionType } from './inp';
import { getCachedInteractionContext, INP_ENTRY_MAP, MAX_PLAUSIBLE_INP_DURATION } from './inp';
import type { InstrumentationHandlerCallback, MetricNavigationType } from '../instrumentation/performanceObserver';
import {
  addClsInstrumentationHandler,
  addInpInstrumentationHandler,
  addLcpInstrumentationHandler,
} from '../instrumentation/performanceObserver';
import type { LargestContentfulPaint, LayoutShift } from './emitSpan';
import { _emitWebVitalSpan } from './emitSpan';
import { isValidLcpMetric } from './lcp';
import type { WebVitalReportEvent } from './reportEvents';
import { listenForWebVitalReportEvents } from './reportEvents';
import { getNavigationSpanForMetric } from './softNavs';
import { getBrowserPerformanceAPI, msToSec, supportsWebVital } from '../performance/utils';
import type { PerformanceEventTiming } from '../instrumentation/performanceObserver';
import {
  UI_INTERACTION_CLICK,
  UI_INTERACTION_DRAG,
  UI_INTERACTION_HOVER,
  UI_INTERACTION_PRESS,
  UI_WEBVITAL_CLS,
  UI_WEBVITAL_LCP,
} from '@sentry/conventions/op';

const INTERACTION_TYPE_TO_SPAN_OP: Record<InteractionType, string> = {
  click: UI_INTERACTION_CLICK,
  hover: UI_INTERACTION_HOVER,
  drag: UI_INTERACTION_DRAG,
  press: UI_INTERACTION_PRESS,
};

type WebVitalMetric = Parameters<Parameters<typeof addLcpInstrumentationHandler>[0]>[0]['metric'];
type InpMetric = Parameters<InstrumentationHandlerCallback>[0]['metric'];

/**
 * Reports a web vital once per navigation, for browsers reporting soft navigations.
 *
 * With `reportSoftNavs`, web-vitals restarts the metric on every soft navigation and force-reports
 * the previous one just before it does (and again on pagehide). Since we also drop
 * `reportAllChanges` in this mode, every value we're handed is already the final one for its
 * navigation, so there is nothing to accumulate: each report is a span.
 */
function trackWebVitalPerNavigation<M extends WebVitalMetric>(
  client: Client,
  addInstrumentationHandler: (callback: (data: { metric: M }) => void) => unknown,
  send: (metric: M, parentSpan: Span | undefined, softNavigationId: number | undefined) => void,
): void {
  let pageloadSpan: Span | undefined;
  client.on('afterStartPageLoadSpan', span => {
    pageloadSpan = span;
  });

  addInstrumentationHandler(({ metric }) => {
    const navigationSpan = getNavigationSpanForMetric(metric);
    if (metric.navigationType === 'soft-navigation') {
      // Reporting an uncorrelated soft navigation vital would attribute it to the wrong route, so
      // it's dropped instead.
      if (navigationSpan) {
        send(metric, navigationSpan, metric.navigationId);
      } else {
        DEBUG_BUILD &&
          debug.log(`[SoftNav] Dropping ${metric.name} for uncorrelated soft navigation ${metric.navigationId}`);
      }
      return;
    }

    send(metric, pageloadSpan, undefined);
  });
}

/**
 * Tracks LCP as a streamed span.
 */
export function trackLcpAsSpan(client: Client, reportSoftNavs = false): void {
  if (!supportsWebVital('largest-contentful-paint')) {
    return;
  }

  if (reportSoftNavs) {
    trackWebVitalPerNavigation(client, addLcpInstrumentationHandler, (metric, parentSpan, softNavigationId) => {
      const entry = metric.entries[metric.entries.length - 1] as LargestContentfulPaint | undefined;
      _sendLcpSpan(metric.value, entry, parentSpan, undefined, softNavigationId, metric.navigationType);
    });
    return;
  }

  let lcpValue = 0;
  let lcpEntry: LargestContentfulPaint | undefined;
  let lcpNavigationType: MetricNavigationType | undefined;

  const cleanupLcpHandler = addLcpInstrumentationHandler(({ metric }) => {
    // The navigation type describes the page, not the entry, so it is worth keeping even for a
    // report we otherwise discard.
    lcpNavigationType = metric.navigationType;

    const entry = metric.entries[metric.entries.length - 1] as LargestContentfulPaint | undefined;
    if (!entry || !isValidLcpMetric(metric.value)) {
      return;
    }
    lcpValue = metric.value;
    lcpEntry = entry;
  }, true);

  listenForWebVitalReportEvents(client, (reportEvent, _, pageloadSpan) => {
    _sendLcpSpan(lcpValue, lcpEntry, pageloadSpan, reportEvent, undefined, lcpNavigationType);
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
  softNavigationId?: number,
  navigationType?: MetricNavigationType,
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
    op: UI_WEBVITAL_LCP,
    origin: 'auto.http.browser.lcp',
    metricName: 'lcp',
    value: lcpValue,
    attributes,
    parentSpan: pageloadSpan,
    reportEvent,
    startTime: timeOrigin,
    endTime,
    softNavigationId,
    navigationType,
  });
}

/**
 * Tracks CLS as a streamed span.
 */
export function trackClsAsSpan(client: Client, reportSoftNavs = false): void {
  if (!supportsWebVital('layout-shift')) {
    return;
  }

  if (reportSoftNavs) {
    trackWebVitalPerNavigation(client, addClsInstrumentationHandler, (metric, parentSpan, softNavigationId) => {
      const entry = metric.entries[metric.entries.length - 1] as LayoutShift | undefined;
      _sendClsSpan(metric.value, entry, parentSpan, undefined, softNavigationId, metric.navigationType);
    });
    return;
  }

  let clsValue = 0;
  let clsEntry: LayoutShift | undefined;
  let clsNavigationType: MetricNavigationType | undefined;

  const cleanupClsHandler = addClsInstrumentationHandler(({ metric }) => {
    // A CLS of 0 is reported with no entries and still emits a span, so the navigation type has to
    // be captured before the entry check rather than alongside the value.
    clsNavigationType = metric.navigationType;

    const entry = metric.entries[metric.entries.length - 1] as LayoutShift | undefined;
    if (!entry) {
      return;
    }
    clsValue = metric.value;
    clsEntry = entry;
  }, true);

  listenForWebVitalReportEvents(client, (reportEvent, _, pageloadSpan) => {
    _sendClsSpan(clsValue, clsEntry, pageloadSpan, reportEvent, undefined, clsNavigationType);
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
  softNavigationId?: number,
  navigationType?: MetricNavigationType,
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
    op: UI_WEBVITAL_CLS,
    origin: 'auto.http.browser.cls',
    metricName: 'cls',
    value: clsValue,
    attributes,
    parentSpan: pageloadSpan,
    reportEvent,
    startTime,
    softNavigationId,
    navigationType,
  });
}

/**
 * Tracks INP and emits it as a web vital span, as a child of the interaction's root span.
 * Requires `registerInpInteractionListener()` to be called separately for cached element names and
 * root spans per interaction.
 */
export function trackInpAsSpan(client: Client, reportSoftNavs = false): void {
  const performance = getBrowserPerformanceAPI();
  if (!performance || !browserPerformanceTimeOrigin()) {
    return;
  }

  // INP reports late (on pagehide, after the pageload span has ended). With span streaming enabled
  // it rides the streaming pipeline. With streaming disabled it would be dropped as a late span, so
  // it is emitted as its own standalone v2 span instead (see `_emitWebVitalSpan`), overriding the
  // static trace lifecycle for INP only.
  // TODO(standalone): once the static trace lifecycle is dropped, INP always streams; drop this flag.
  const standalone = !hasSpanStreamingEnabled(client);

  if (reportSoftNavs) {
    // INP restarts per navigation and reports once that navigation is over, by which point the
    // navigation span has ended and the interaction cache no longer knows about it. The metric
    // says which navigation it belongs to, so INP is attributed exactly like LCP and CLS.
    trackWebVitalPerNavigation(client, addInpInstrumentationHandler, (metric, parentSpan, softNavigationId) => {
      if (isPlausibleInp(metric)) {
        _sendInpSpan(metric.value, findInpEntry(metric), standalone, parentSpan, softNavigationId, metric);
      }
    });
    return;
  }

  const onInp: InstrumentationHandlerCallback = ({ metric }) => {
    if (isPlausibleInp(metric)) {
      _sendInpSpan(metric.value, findInpEntry(metric), standalone, undefined, undefined, metric);
    }
  };

  addInpInstrumentationHandler(onInp);
}

function isPlausibleInp(metric: InpMetric): boolean {
  return metric.value != null && msToSec(metric.value) <= MAX_PLAUSIBLE_INP_DURATION;
}

/**
 * The entry an INP span is built from: the one whose duration the reported value came from.
 *
 * There isn't always one. When every interaction of a soft navigation stayed below the Event Timing
 * threshold, web-vitals reports a synthetic value with no entries at all - see
 * `_estimateP98LongestInteraction`. The span still gets reported in that case, just without the
 * element and interaction type an entry would have supplied.
 */
function findInpEntry(metric: InpMetric): PerformanceEventTiming | undefined {
  return metric.entries.find(e => e.duration === metric.value && INP_ENTRY_MAP[e.name]);
}

/**
 * Exported only for testing.
 */
export function _sendInpSpan(
  inpValue: number,
  entry: PerformanceEventTiming | undefined,
  standalone = false,
  attributedSpan?: Span,
  softNavigationId?: number,
  metric?: InpMetric,
): void {
  DEBUG_BUILD && debug.log(`Sending INP span (${inpValue})`);

  // A web vital span carries the metric, not a real interaction timing, so an INP without an entry
  // is still worth reporting. It just has no element or interaction type to describe, and is placed
  // at the start of the navigation it belongs to rather than at the interaction.
  const startTime = msToSec(
    (browserPerformanceTimeOrigin() as number) + (entry?.startTime ?? metric?.navigationStartTime ?? 0),
  );
  const duration = msToSec(inpValue);
  // An INP without an entry has no interaction type to report. It still has to land inside the
  // `ui.interaction.*` family, because falling outside it would hide exactly the fast navigations
  // that web-vitals synthesizes these values for (GoogleChrome/web-vitals#724), reintroducing the
  // reporting bias they were added to remove.
  const interactionType = (entry && INP_ENTRY_MAP[entry.name]) || 'click';

  const cachedContext = entry && getCachedInteractionContext(entry.interactionId);
  const activeSpan = getActiveSpan();
  const rootSpan = activeSpan ? getRootSpan(activeSpan) : undefined;

  // With soft navigations the caller knows exactly which navigation the metric belongs to. Without
  // them we fall back to the span that was active when the interaction was observed.
  const spanToUse = attributedSpan || cachedContext?.span || rootSpan;
  const name = cachedContext?.elementName || (entry ? htmlTreeAsString(entry.target) : 'Interaction to next paint');

  _emitWebVitalSpan({
    name,
    op: INTERACTION_TYPE_TO_SPAN_OP[interactionType],
    origin: 'auto.http.browser.inp',
    metricName: 'inp',
    value: inpValue,
    attributes: {
      [SEMANTIC_ATTRIBUTE_EXCLUSIVE_TIME]: entry?.duration ?? inpValue,
    },
    startTime,
    endTime: startTime + duration,
    navigationType: metric?.navigationType,
    parentSpan: spanToUse,
    standalone,
    softNavigationId,
  });
}
