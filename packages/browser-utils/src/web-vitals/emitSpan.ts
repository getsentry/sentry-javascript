import type { Integration, Span, SpanAttributes } from '@sentry/core';
import {
  getClient,
  getCurrentScope,
  getRootSpan,
  SEMANTIC_ATTRIBUTE_EXCLUSIVE_TIME,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  spanToJSON,
} from '@sentry/core';
import { startInactiveSpan } from '@sentry/core/browser';
import { SENTRY_SEGMENT_NAME, SENTRY_TRANSACTION } from '@sentry/conventions/attributes';
import { WINDOW } from '../types';
import type { WebVitalReportEvent } from './reportEvents';
import { SOFT_NAVIGATION_ID_ATTRIBUTE } from './softNavs';

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
  /** Set when the vital was reported for a soft navigation rather than the initial page load. */
  softNavigationId?: number;
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
    softNavigationId,
  } = options;

  // Taken off the segment span itself, so it can't diverge from it: a routing instrumentation may
  // rename that span (a pageload span is named `Pageload` until its route resolves), and the scope's
  // transaction name is deliberately not kept in sync with it. Only a standalone span, which is sent
  // without its segment span, has to fall back to the scope.
  const segmentSpan = parentSpan && getRootSpan(parentSpan);
  const segmentName = segmentSpan ? spanToJSON(segmentSpan).name : getCurrentScope().getScopeData().transactionName;

  const attributes: SpanAttributes = {
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: origin,
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: op,
    [SEMANTIC_ATTRIBUTE_EXCLUSIVE_TIME]: 0,
    [`browser.web_vital.${metricName}.value`]: value,
    // oxlint-disable-next-line typescript-eslint/no-deprecated
    [SENTRY_TRANSACTION]: segmentName,
    [SENTRY_SEGMENT_NAME]: segmentName,
    // Web vital score calculation relies on the user agent
    'user_agent.original': WINDOW.navigator?.userAgent,
    ...passedAttributes,
  };

  if (parentSpan && spanToJSON(parentSpan).attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP] === 'pageload') {
    // for LCP and CLS, we collect the pageload span id as an attribute
    attributes['sentry.pageload.span_id'] = parentSpan.spanContext().spanId;
  }

  if (reportEvent) {
    attributes[`browser.web_vital.${metricName}.report_event`] = reportEvent;
  }

  if (softNavigationId != null) {
    attributes[SOFT_NAVIGATION_ID_ATTRIBUTE] = softNavigationId;
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
