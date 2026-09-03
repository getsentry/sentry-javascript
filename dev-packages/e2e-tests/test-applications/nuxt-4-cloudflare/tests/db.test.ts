import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp } from '@sentry-internal/test-utils';

// Streamed child spans arrive across several envelopes, so collect until the request's segment
// span and the expected db spans have all been flushed. The streamed segment name is method-only
// (`GET`), so the segment is selected via `url.path`.
function collectDbSpans(minDbSpans: number) {
  return collectStreamedSpans(
    'nuxt-4-cloudflare',
    spans =>
      spans.some(span => span.is_segment && span.attributes['url.path']?.value === '/api/db-mysql') &&
      spans.filter(span => getSpanOp(span) === 'db').length >= minDbSpans,
  );
}

test('a real mysql query emits a db span with orchestrion-channel attributes', async ({ request }) => {
  const spansPromise = collectDbSpans(1);

  const res = await request.get('/api/db-mysql');
  expect(res.status()).toBe(200);

  const spans = await spansPromise;
  const rootSpan = spans.find(span => span.is_segment && span.attributes['url.path']?.value === '/api/db-mysql');
  expect(rootSpan).toBeDefined();
  expect(getSpanOp(rootSpan!)).toBe('http.server');

  const dbSpans = spans.filter(span => getSpanOp(span) === 'db' && span.trace_id === rootSpan!.trace_id);

  const firstQuery = dbSpans.find(span => span.attributes['db.query.text']?.value === 'SELECT 1 + 1 AS solution');
  expect(firstQuery).toBeDefined();
  expect(firstQuery!.name).toBe('SELECT');
  expect(firstQuery!.attributes).toMatchObject({
    'sentry.origin': { type: 'string', value: 'auto.db.mysql' },
    'db.system.name': { type: 'string', value: 'mysql' },
    'db.query.text': { type: 'string', value: 'SELECT 1 + 1 AS solution' },
    'server.address': { type: 'string', value: '127.0.0.1' },
    'server.port': { type: 'integer', value: 3306 },
    'db.user': { type: 'string', value: 'root' },
  });
});

test('a nested query lands on the same trace (async context restored)', async ({ request }) => {
  const spansPromise = collectDbSpans(2);

  const res = await request.get('/api/db-mysql');
  expect(res.status()).toBe(200);

  const spans = await spansPromise;
  const rootSpan = spans.find(span => span.is_segment && span.attributes['url.path']?.value === '/api/db-mysql');
  expect(rootSpan).toBeDefined();

  const queryTexts = spans
    .filter(span => getSpanOp(span) === 'db' && span.trace_id === rootSpan!.trace_id)
    .map(span => span.attributes['db.query.text']?.value);
  expect(queryTexts).toContain('SELECT 1 + 1 AS solution');
  expect(queryTexts).toContain('SELECT NOW()');
});
