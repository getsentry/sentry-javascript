import { expect, test } from '@playwright/test';
import { collectStreamedSpansUntilSegment } from '@sentry-internal/test-utils';

test('Should allow for async context isolation in the edge SDK', async ({ request }) => {
  // The inner and outer spans are children of the segment span, which ends last, so accumulate until
  // the segment arrives to be sure both children are in hand.
  const spansPromise = collectStreamedSpansUntilSegment('nextjs-pages-dir', 'GET /api/async-context-edge-endpoint');

  await request.get('/api/async-context-edge-endpoint');

  const spans = await spansPromise;

  const outerSpan = spans.find(span => span.name === 'outer-span');
  const innerSpan = spans.find(span => span.name === 'inner-span');

  expect(outerSpan).toBeDefined();
  expect(innerSpan).toBeDefined();
  expect(outerSpan?.parent_span_id).toStrictEqual(innerSpan?.parent_span_id);
});
