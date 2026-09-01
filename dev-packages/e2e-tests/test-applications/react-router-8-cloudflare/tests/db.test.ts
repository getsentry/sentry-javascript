import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp } from '@sentry-internal/test-utils';

// Under span streaming the mysql span name is the query summary, so both queries here are named
// `SELECT`. `db.query.text` is what tells them apart.
test('a real mysql query emits a db span with orchestrion-channel attributes', async ({ request }) => {
  const spansPromise = collectStreamedSpans('react-router-8-cloudflare', spans => {
    return (
      spans.some(span => getSpanOp(span) === 'http.server' && span.is_segment) &&
      spans.some(span => getSpanOp(span) === 'db')
    );
  });

  const res = await request.get('/performance/db-mysql');
  expect(res.status()).toBe(200);

  const spans = await spansPromise;
  const dbSpans = spans.filter(span => getSpanOp(span) === 'db');

  const firstQuery = dbSpans.find(span => span.attributes['db.query.text']?.value === 'SELECT 1 + 1 AS solution');
  expect(firstQuery).toBeDefined();
  expect(firstQuery!.name).toBe('SELECT');
  expect(firstQuery!.attributes['sentry.origin']?.value).toBe('auto.db.mysql');
  expect(firstQuery!.attributes['db.system.name']?.value).toBe('mysql');
  expect(firstQuery!.attributes['server.address']?.value).toBe('127.0.0.1');
  expect(firstQuery!.attributes['server.port']?.value).toBe(3306);
  expect(firstQuery!.attributes['db.user']?.value).toBe('root');
});

test('a nested query lands on the same segment (async context restored)', async ({ request }) => {
  const spansPromise = collectStreamedSpans('react-router-8-cloudflare', spans => {
    return (
      spans.some(span => getSpanOp(span) === 'http.server' && span.is_segment) &&
      spans.filter(span => getSpanOp(span) === 'db').length >= 2
    );
  });

  const res = await request.get('/performance/db-mysql');
  expect(res.status()).toBe(200);

  const spans = await spansPromise;
  const segmentSpan = spans.find(span => getSpanOp(span) === 'http.server' && span.is_segment)!;
  const dbSpans = spans.filter(span => getSpanOp(span) === 'db');

  const queryTexts = dbSpans.map(span => span.attributes['db.query.text']?.value);
  expect(queryTexts).toContain('SELECT 1 + 1 AS solution');
  expect(queryTexts).toContain('SELECT NOW()');

  for (const dbSpan of dbSpans) {
    expect(dbSpan.trace_id).toBe(segmentSpan.trace_id);
  }
});
