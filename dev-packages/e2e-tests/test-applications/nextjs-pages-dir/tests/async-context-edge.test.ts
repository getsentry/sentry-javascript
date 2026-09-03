import { expect, test } from '@playwright/test';
import { collectStreamedSpans } from '@sentry-internal/test-utils';

test('Should allow for async context isolation in the edge SDK', async ({ request }) => {
  // The inner and outer spans are children of the segment span, which ends last, so accumulate until
  // the segment arrives to be sure both children are in hand.
  const spansPromise = collectStreamedSpans('nextjs-pages-dir', spans =>
    spans.some(span => span.name === 'GET /api/async-context-edge-endpoint' && span.is_segment),
  );

  await request.get('/api/async-context-edge-endpoint');

  const spans = await spansPromise;

  const outerSpan = spans.find(span => span.name === 'outer-span');
  const innerSpan = spans.find(span => span.name === 'inner-span');

  expect(outerSpan).toBeDefined();
  expect(innerSpan).toBeDefined();
  expect(outerSpan?.parent_span_id).toStrictEqual(innerSpan?.parent_span_id);
});
