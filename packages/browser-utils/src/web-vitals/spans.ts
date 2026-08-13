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
import type { InstrumentationHandlerCallback } from '../instrumentation/performanceObserver';
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
import { onHidden } from './utils';
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

/**
 * Tracks LCP as a streamed span.
 *
 * With `reportSoftNavs`, web-vitals restarts LCP on every soft navigation, so we also get one LCP
 * per soft navigation. Each one is finalized at the following soft navigation (or on pagehide) and
 * reported against the navigation span it belongs to.
 */
export function trackLcpAsSpan(client: Client, reportSoftNavs = false): void {
  let lcpValue = 0;
  let lcpEntry: LargestContentfulPaint | undefined;
  // The navigation the value above belongs to. `navigationSpan` is only set for soft navigations;
  // the initial page load reports against the pageload span instead.
  let navigationId: number | undefined;
  let navigationSpan: Span | undefined;

  if (!supportsWebVital('largest-contentful-paint')) {
    return;
  }

  const flush = (reportEvent: WebVitalReportEvent, parentSpan?: Span): void => {
    _sendLcpSpan(lcpValue, lcpEntry, parentSpan, reportEvent, navigationSpan ? navigationId : undefined);
    lcpValue = 0;
    lcpEntry = undefined;
  };

  const cleanupLcpHandler = addLcpInstrumentationHandler(({ metric }) => {
    if (reportSoftNavs && navigationId !== undefined && metric.navigationId !== navigationId) {
      // web-vitals finalized the previous navigation's LCP before restarting for this one. The
      // initial page load is handed over by the report events below, so only soft navigations are
      // flushed here - and only if we managed to correlate one to a navigation span.
      if (navigationSpan) {
        flush('navigation', navigationSpan);
      }
      lcpValue = 0;
      lcpEntry = undefined;
    }
    navigationId = metric.navigationId;
    navigationSpan = getNavigationSpanForMetric(metric);

    const entry = metric.entries[metric.entries.length - 1] as LargestContentfulPaint | undefined;
    if (!entry || !isValidLcpMetric(metric.value)) {
      return;
    }
    lcpValue = metric.value;
    lcpEntry = entry;
  }, true);

  listenForWebVitalReportEvents(client, (reportEvent, _, pageloadSpan) => {
    flush(reportEvent, pageloadSpan);
    // Soft navigations keep reporting after the initial page load, so the handler has to stay.
    if (!reportSoftNavs) {
      cleanupLcpHandler();
    }
  });

  if (reportSoftNavs) {
    // The report events above only fire once, for the initial page load. Without this, the LCP of
    // the last soft navigation would never be flushed.
    onHidden(() => {
      if (navigationSpan) {
        flush('pagehide', navigationSpan);
      }
    });
  }
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
  });
}

/**
 * Tracks CLS as a streamed span.
 *
 * With `reportSoftNavs`, layout shifts are attributed to the soft navigation they happened during
 * instead of accumulating over the whole page lifetime, so each soft navigation gets its own CLS.
 */
export function trackClsAsSpan(client: Client, reportSoftNavs = false): void {
  let clsValue = 0;
  let clsEntry: LayoutShift | undefined;
  // Unlike LCP, a CLS of 0 is a meaningful value, so we can't use the value itself to tell whether
  // there is anything left to report.
  let hasUnreportedValue = false;
  let navigationId: number | undefined;
  let navigationSpan: Span | undefined;

  if (!supportsWebVital('layout-shift')) {
    return;
  }

  const flush = (reportEvent: WebVitalReportEvent, parentSpan?: Span): void => {
    _sendClsSpan(clsValue, clsEntry, parentSpan, reportEvent, navigationSpan ? navigationId : undefined);
    clsValue = 0;
    clsEntry = undefined;
    hasUnreportedValue = false;
  };

  const cleanupClsHandler = addClsInstrumentationHandler(({ metric }) => {
    if (reportSoftNavs && navigationId !== undefined && metric.navigationId !== navigationId) {
      if (navigationSpan && hasUnreportedValue) {
        flush('navigation', navigationSpan);
      }
      clsValue = 0;
      clsEntry = undefined;
    }
    navigationId = metric.navigationId;
    navigationSpan = getNavigationSpanForMetric(metric);
    hasUnreportedValue = true;

    const entry = metric.entries[metric.entries.length - 1] as LayoutShift | undefined;
    if (!entry) {
      return;
    }
    clsValue = metric.value;
    clsEntry = entry;
  }, true);

  listenForWebVitalReportEvents(client, (reportEvent, _, pageloadSpan) => {
    flush(reportEvent, pageloadSpan);
    if (!reportSoftNavs) {
      cleanupClsHandler();
    }
  });

  if (reportSoftNavs) {
    onHidden(() => {
      if (navigationSpan && hasUnreportedValue) {
        flush('pagehide', navigationSpan);
      }
    });
  }
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

    // With soft navigations, INP restarts per navigation and reports once the navigation is over,
    // by which point the navigation span has long ended and the interaction cache no longer knows
    // about it. The metric tells us which navigation it belongs to, which is more reliable.
    const navigationSpan = reportSoftNavs ? getNavigationSpanForMetric(metric) : undefined;
    if (reportSoftNavs && metric.navigationType === 'soft-navigation' && !navigationSpan) {
      return;
    }

    _sendInpSpan(metric.value, entry, standalone, navigationSpan, navigationSpan ? metric.navigationId : undefined);
  };

  addInpInstrumentationHandler(onInp);
}

/**
 * Exported only for testing.
 */
export function _sendInpSpan(
  inpValue: number,
  entry: PerformanceEventTiming,
  standalone = false,
  navigationSpan?: Span,
  softNavigationId?: number,
): void {
  DEBUG_BUILD && debug.log(`Sending INP span (${inpValue})`);

  const startTime = msToSec((browserPerformanceTimeOrigin() as number) + entry.startTime);
  const duration = msToSec(inpValue);
  const interactionType = INP_ENTRY_MAP[entry.name];

  if (!interactionType) {
    return;
  }

  const cachedContext = getCachedInteractionContext(entry.interactionId);
  const activeSpan = getActiveSpan();
  const rootSpan = activeSpan ? getRootSpan(activeSpan) : undefined;

  const spanToUse = navigationSpan || cachedContext?.span || rootSpan;
  const name = cachedContext?.elementName || htmlTreeAsString(entry.target);

  _emitWebVitalSpan({
    name,
    op: INTERACTION_TYPE_TO_SPAN_OP[interactionType],
    origin: 'auto.http.browser.inp',
    metricName: 'inp',
    value: inpValue,
    attributes: {
      [SEMANTIC_ATTRIBUTE_EXCLUSIVE_TIME]: entry.duration,
    },
    startTime,
    endTime: startTime + duration,
    parentSpan: spanToUse,
    standalone,
    softNavigationId,
  });
}
