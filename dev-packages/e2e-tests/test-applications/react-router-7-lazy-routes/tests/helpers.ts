import type { Page } from '@playwright/test';
import type { SerializedStreamedSpan } from '@sentry-internal/test-utils';
import { getSpanOp, waitForStreamedSpans } from '@sentry-internal/test-utils';

// Streamed `http.client` names are only `<METHOD> <domain>`, so the request URL has to come from
// the `url.full` attribute.
export function hasUrlPart(span: SerializedStreamedSpan, part: string): boolean {
  const urlFull = span.attributes['url.full']?.value;
  return typeof urlFull === 'string' && urlFull.includes(part);
}

/**
 * Child spans of `segmentSpan`'s trace, picked out of a collection that spans several traces.
 * `collectStreamedSpans` already scopes its result to one trace, so this is only for the spans
 * gathered by the cross-trace collector below.
 */
export function childSpansInTraceOf(
  spans: SerializedStreamedSpan[],
  segmentSpan: SerializedStreamedSpan,
): SerializedStreamedSpan[] {
  return spans.filter(span => span.trace_id === segmentSpan.trace_id && !span.is_segment);
}

/** Non-segment spans of a single-trace collection. */
export function childSpans(spans: SerializedStreamedSpan[]): SerializedStreamedSpan[] {
  return spans.filter(span => !span.is_segment);
}

export function collectUntilNavigationSegment(
  name: string,
  onSpan: (span: SerializedStreamedSpan) => void,
): Promise<SerializedStreamedSpan[]> {
  return waitForStreamedSpans('react-router-7-lazy-routes', spans => {
    spans.forEach(onSpan);
    return spans.some(span => span.is_segment && getSpanOp(span) === 'navigation' && span.name === name);
  });
}

/**
 * Segments are sent in the order they end, and a new pageload or navigation cancels the open one. So once a
 * segment that ended on its own (by `idleTimeout`) has arrived, every segment started before it has arrived too.
 */
export function endedByIdleTimeout(span: SerializedStreamedSpan): boolean {
  return span.attributes['sentry.idle_span_finish_reason']?.value === 'idleTimeout';
}

type TestWindow = { __SENTRY_ACTIVE_SPAN_OP__: () => unknown; __SENTRY_STARTED_NAVIGATION_SPANS__: number };

/** Waits for the open pageload or navigation span to end, which is earlier than it reaches the proxy. */
export async function waitForIdleSpanEnd(page: Page): Promise<void> {
  await page.waitForFunction(() => !(window as unknown as TestWindow).__SENTRY_ACTIVE_SPAN_OP__());
}

export function getStartedNavigationSpanCount(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as TestWindow).__SENTRY_STARTED_NAVIGATION_SPANS__);
}
