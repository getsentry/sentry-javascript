import type { Client, Integration, Span, SpanAttributes } from '@sentry/core';
import {
  browserPerformanceTimeOrigin,
  debug,
  getActiveSpan,
  getClient,
  getCurrentScope,
  getRootSpan,
  hasSpanStreamingEnabled,
  SEMANTIC_ATTRIBUTE_EXCLUSIVE_TIME,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  spanToStreamedSpanJSON,
  startInactiveSpan,
  timestampInSeconds,
} from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';
import { htmlTreeAsString } from '../htmlTreeAsString';
import { WINDOW } from '../types';
import { getCachedInteractionContext, INP_ENTRY_MAP, MAX_PLAUSIBLE_INP_DURATION } from './inp';
import type { InstrumentationHandlerCallback } from './instrument';
import { addClsInstrumentationHandler, addInpInstrumentationHandler, addLcpInstrumentationHandler } from './instrument';
import { isValidLcpMetric } from './lcp';
import { getNavigationSpanForNavigationId } from './softNavCorrelation';
import type { WebVitalReportEvent } from './utils';
import { getBrowserPerformanceAPI, listenForWebVitalReportEvents, msToSec, supportsWebVital } from './utils';
import type { PerformanceEventTiming } from './instrument';
import { SENTRY_SEGMENT_NAME, SENTRY_TRANSACTION } from '@sentry/conventions/attributes';

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
  /**
   * When `true`, the span is sent on its own as a v2 streamed span instead of being folded into a
   * transaction. Used for INP when span streaming is disabled (it reports late, so it can't ride
   * the pageload transaction).
   *
   * TODO(standalone): remove once the static (transaction) trace lifecycle is dropped and INP always streams.
   */
  standalone?: boolean;
}

/**
 * Adds the soft-navigation marker attributes to a web vital span's attributes when it belongs to a
 * soft navigation. Consumers can filter on `sentry.web_vital.navigation_type` and correlate the
 * vital to its navigation span via `sentry.navigation_id` / `sentry.navigation.span_id`.
 */
function _withSoftNavAttributes(attributes: SpanAttributes, navigationId?: string): SpanAttributes {
  if (!navigationId) {
    return attributes;
  }

  const navigationSpan = getNavigationSpanForNavigationId(navigationId);

  return {
    ...attributes,
    'sentry.web_vital.navigation_type': 'soft-navigation',
    'sentry.navigation_id': navigationId,
    'sentry.navigation.span_id': navigationSpan?.spanContext().spanId,
  };
}

/**
 * Emits a web vital span. When `standalone` is set it is sent on its own as a v2 streamed span;
 * otherwise it flows through the span streaming pipeline as a child of `parentSpan`.
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
    standalone,
  } = options;

  const routeName = getCurrentScope().getScopeData().transactionName;

  const attributes: SpanAttributes = {
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: origin,
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: op,
    [SEMANTIC_ATTRIBUTE_EXCLUSIVE_TIME]: 0,
    [`browser.web_vital.${metricName}.value`]: value,
    // oxlint-disable-next-line typescript-eslint/no-deprecated
    [SENTRY_TRANSACTION]: routeName,
    [SENTRY_SEGMENT_NAME]: routeName,
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

  // A standalone span is sent as a plain v2 span without running the `processSpan` hooks (see
  // `captureStandaloneSpanWithStaticCallback`), so Replay can't attach the replay id itself. Set it
  // here, mirroring Replay's `processSpan`, so INP keeps its replay association like it did on v1.
  // TODO(standalone): remove once the static (transaction) trace lifecycle is dropped and INP always
  // streams, at which point Replay's `processSpan` runs and attaches the replay id.
  if (standalone) {
    Object.assign(attributes, getReplayAttributes());
  }

  const span = startInactiveSpan({
    name,
    attributes,
    startTime,
    parentSpan,
    // oxlint-disable-next-line typescript/no-deprecated -- intentional during the v1/v2 transition; see the TODO(standalone) above
    experimental: standalone ? { standalone: true } : undefined,
  });

  if (span) {
    DEBUG_BUILD &&
      debug.log(
        `[SoftNav] Emitted ${op} span: spanTrace=${span.spanContext().traceId}, parentTrace=${parentSpan?.spanContext().traceId ?? 'none'}, hasParent=${!!parentSpan}, standalone=${!!standalone}`,
      );
    span.end(endTime ?? startTime);
  }
}

interface ReplayIntegration extends Integration {
  getReplayId: (onlyIfSampled?: boolean) => string | undefined;
  getRecordingMode: () => 'session' | 'buffer' | undefined;
}

// TODO(standalone): remove once the static (transaction) trace lifecycle is dropped; Replay's
// `processSpan` then attaches the replay id to the streamed INP span instead.
function getReplayAttributes(): SpanAttributes {
  const replay = getClient()?.getIntegrationByName<ReplayIntegration>('Replay');
  const replayId = replay?.getReplayId(true);
  if (!replayId) {
    return {};
  }

  return {
    'sentry.replay_id': replayId,
    'sentry._internal.replay_is_buffering': replay!.getRecordingMode() === 'buffer' ? true : undefined,
  };
}

/**
 * Tracks LCP as a streamed span.
 */
export function trackLcpAsSpan(client: Client, reportSoftNavs?: boolean): void {
  let lcpValue = 0;
  let lcpEntry: LargestContentfulPaint | undefined;

  if (!supportsWebVital('largest-contentful-paint')) {
    return;
  }

  DEBUG_BUILD && debug.log(`[SoftNav] trackLcpAsSpan wired (reportSoftNavs=${!!reportSoftNavs})`);

  const cleanupLcpHandler = addLcpInstrumentationHandler(
    ({ metric }) => {
      DEBUG_BUILD &&
        debug.log(`[SoftNav] LCP handler fired: navigationType=${metric.navigationType}, value=${metric.value}`);
      const entry = metric.entries[metric.entries.length - 1] as LargestContentfulPaint | undefined;
      if (!entry || !isValidLcpMetric(metric.value)) {
        return;
      }

      // Soft navigations re-fire this handler with a fresh `soft-navigation` metric. Each one is its
      // own vital, so emit it immediately as its own span (like INP) rather than buffering it for the
      // one-shot pageload report below. The vendored web-vitals lib keeps the observer alive for us
      // when soft navs are enabled (see `stopOnCallback: !reportSoftNavs`).
      if (metric.navigationType === 'soft-navigation') {
        _sendLcpSpan(metric.value, entry, undefined, undefined, metric.navigationId);
        return;
      }

      lcpValue = metric.value;
      lcpEntry = entry;
    },
    // Keep the observer alive across the page lifetime when soft navs are enabled so subsequent
    // navigations can still report. Otherwise stop after the first (pageload) report.
    !reportSoftNavs,
    reportSoftNavs,
  );

  listenForWebVitalReportEvents(client, (reportEvent, _, pageloadSpan) => {
    _sendLcpSpan(lcpValue, lcpEntry, pageloadSpan, reportEvent);
    // Only tear down the handler when we're not keeping it alive for soft navs.
    if (!reportSoftNavs) {
      cleanupLcpHandler();
    }
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
  navigationId?: string,
): void {
  if (!isValidLcpMetric(lcpValue)) {
    return;
  }

  DEBUG_BUILD && debug.log(`Sending LCP span (${lcpValue})${navigationId ? ` [soft-nav ${navigationId}]` : ''}`);

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
    origin: navigationId ? 'auto.http.browser.soft_navigation' : 'auto.http.browser.lcp',
    metricName: 'lcp',
    value: lcpValue,
    attributes: _withSoftNavAttributes(attributes, navigationId),
    parentSpan: navigationId ? getNavigationSpanForNavigationId(navigationId) : pageloadSpan,
    reportEvent,
    startTime: timeOrigin,
    endTime,
  });
}

/**
 * Tracks CLS as a streamed span.
 */
export function trackClsAsSpan(client: Client, reportSoftNavs?: boolean): void {
  let clsValue = 0;
  let clsEntry: LayoutShift | undefined;

  if (!supportsWebVital('layout-shift')) {
    return;
  }

  DEBUG_BUILD && debug.log(`[SoftNav] trackClsAsSpan wired (reportSoftNavs=${!!reportSoftNavs})`);

  const cleanupClsHandler = addClsInstrumentationHandler(
    ({ metric }) => {
      DEBUG_BUILD &&
        debug.log(`[SoftNav] CLS handler fired: navigationType=${metric.navigationType}, value=${metric.value}`);
      const entry = metric.entries[metric.entries.length - 1] as LayoutShift | undefined;
      if (!entry) {
        return;
      }

      // Soft navigations re-fire with a fresh `soft-navigation` metric; emit each as its own span
      // instead of buffering for the one-shot pageload report below (see the LCP handler for details).
      if (metric.navigationType === 'soft-navigation') {
        _sendClsSpan(metric.value, entry, undefined, undefined, metric.navigationId);
        return;
      }

      clsValue = metric.value;
      clsEntry = entry;
    },
    !reportSoftNavs,
    reportSoftNavs,
  );

  listenForWebVitalReportEvents(client, (reportEvent, _, pageloadSpan) => {
    _sendClsSpan(clsValue, clsEntry, pageloadSpan, reportEvent);
    if (!reportSoftNavs) {
      cleanupClsHandler();
    }
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
  navigationId?: string,
): void {
  DEBUG_BUILD && debug.log(`Sending CLS span (${clsValue})${navigationId ? ` [soft-nav ${navigationId}]` : ''}`);

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
    origin: navigationId ? 'auto.http.browser.soft_navigation' : 'auto.http.browser.cls',
    metricName: 'cls',
    value: clsValue,
    attributes: _withSoftNavAttributes(attributes, navigationId),
    parentSpan: navigationId ? getNavigationSpanForNavigationId(navigationId) : pageloadSpan,
    reportEvent,
    startTime,
  });
}

/**
 * Tracks INP and emits it as a web vital span, as a child of the interaction's root span.
 * Requires `registerInpInteractionListener()` to be called separately for cached element names and
 * root spans per interaction.
 */
export function trackInpAsSpan(client: Client, reportSoftNavs?: boolean): void {
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

  DEBUG_BUILD && debug.log(`[SoftNav] trackInpAsSpan wired (reportSoftNavs=${!!reportSoftNavs})`);

  const onInp: InstrumentationHandlerCallback = ({ metric }) => {
    DEBUG_BUILD &&
      debug.log(`[SoftNav] INP handler fired: navigationType=${metric.navigationType}, value=${metric.value}`);
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

    _sendInpSpan(metric.value, entry, standalone);
  };

  addInpInstrumentationHandler(onInp, reportSoftNavs);
}

/**
 * Exported only for testing.
 */
export function _sendInpSpan(inpValue: number, entry: PerformanceEventTiming, standalone = false): void {
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
      // oxlint-disable-next-line typescript-eslint/no-deprecated
      [SENTRY_TRANSACTION]: routeName,
      [SENTRY_SEGMENT_NAME]: routeName,
    },
    startTime,
    endTime: startTime + duration,
    parentSpan: spanToUse,
    standalone,
  });
}
