import { expect, test } from '@playwright/test';
import { collectStreamedSpansUntilSegment, getSpanOp } from '@sentry-internal/test-utils';

// `withSentry` passes an instrumented `env` to the OpenNext handler, which `getCloudflareContext()` returns.
test('Should create a span for a D1 query through the `env` of `getCloudflareContext`', async ({ request }) => {
  const spansPromise = collectStreamedSpansUntilSegment('nextjs-16-cf-workers', 'GET /api/d1');

  const response = await request.get('/api/d1');
  expect(await response.json()).toStrictEqual([{ one: 1 }]);

  const spans = await spansPromise;
  const d1Span = spans.find(span => getSpanOp(span) === 'db.query')!;

  expect(d1Span.is_segment).toBe(false);
  expect(d1Span.attributes).toMatchObject({
    'db.system.name': { value: 'cloudflare-d1', type: 'string' },
    'db.query.text': { value: 'SELECT ? AS one', type: 'string' },
    'sentry.origin': { value: 'auto.db.cloudflare.d1', type: 'string' },
  });
});
