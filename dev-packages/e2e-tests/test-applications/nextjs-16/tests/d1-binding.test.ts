import { expect, test } from '@playwright/test';
import { collectStreamedSpansUntilSegment, getRuntime, getSpanOp } from '@sentry-internal/test-utils';

test.skip(getRuntime() !== 'cloudflare', 'D1 is a binding of Cloudflare Workers');

// `withSentry` passes an instrumented `env` to the OpenNext handler, which `getCloudflareContext()` returns.
test('Should create a span for a D1 query through the `env` of `getCloudflareContext`', async ({ request }) => {
  const spansPromise = collectStreamedSpansUntilSegment('nextjs-16', 'GET /api/d1');

  const response = await request.get('/api/d1');
  expect(await response.json()).toStrictEqual([{ one: 1 }]);

  const spans = await spansPromise;
  const d1Span = spans.find(span => getSpanOp(span) === 'db.query')!;

  expect(spans.filter(span => getSpanOp(span) === 'db.query')).toEqual([d1Span]);
  expect(d1Span.name).toBe('SELECT');
  expect(d1Span.is_segment).toBe(false);
  expect(d1Span.status).toBe('ok');
  expect(d1Span.attributes['db.system.name']?.value).toBe('cloudflare-d1');
  expect(d1Span.attributes['db.query.text']?.value).toBe('SELECT ? AS one');
  expect(d1Span.attributes['sentry.origin']?.value).toBe('auto.db.cloudflare.d1');
});
