import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp } from '@sentry-internal/test-utils';
import { APP_NAME } from '../constants';

test.describe('server - redis db spans', () => {
  test('server loader emits db.query child spans on the http.server segment', async ({ page }) => {
    const spansPromise = collectStreamedSpans(
      APP_NAME,
      spansOfTrace =>
        spansOfTrace.some(span => span.name === 'GET /performance/redis' && span.is_segment) &&
        // loader runs SET then GET => at least two redis command spans
        spansOfTrace.filter(span => getSpanOp(span) === 'db.query').length >= 2,
    );

    await page.goto('/performance/redis');

    const spans = await spansPromise;
    const segmentSpan = spans.find(span => span.is_segment)!;

    expect(getSpanOp(segmentSpan)).toBe('http.server');

    // Collect every span id in the trace (segment + children) so we can verify nesting.
    const spanIds = new Set(spans.map(span => span.span_id));
    const redisSpans = spans.filter(span => getSpanOp(span) === 'db.query');

    expect(redisSpans.length).toBeGreaterThanOrEqual(2);

    // every redis span nests under the http.server segment (its parent is part of the same span tree)
    const allNested = redisSpans.every(
      span => typeof span.parent_span_id === 'string' && spanIds.has(span.parent_span_id),
    );
    expect(allNested).toBe(true);
  });
});
