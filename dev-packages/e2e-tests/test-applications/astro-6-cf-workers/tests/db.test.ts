import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp } from '@sentry-internal/test-utils';

const APP_NAME = 'astro-6-cf-workers';

test('a real mysql query emits a db span with orchestrion-channel attributes', async ({ request }) => {
  const spansPromise = collectStreamedSpans(
    APP_NAME,
    spans =>
      spans.some(span => getSpanOp(span) === 'http.server' && span.is_segment) &&
      spans.some(span => getSpanOp(span) === 'db'),
  );

  const res = await request.get('/db-mysql');
  expect(res.status()).toBe(200);

  const spans = await spansPromise;
  const dbSpans = spans.filter(span => getSpanOp(span) === 'db');

  const firstQuery = dbSpans.find(span => span.attributes['db.query.text']?.value === 'SELECT 1 + 1 AS solution');
  expect(firstQuery).toBeDefined();
  // With span streaming the span name is the low-cardinality query summary; the statement stays in
  // `db.query.text`.
  expect(firstQuery!.name).toBe('SELECT');
  expect(firstQuery!.attributes['sentry.origin']?.value).toBe('auto.db.mysql');
  expect(firstQuery!.attributes['db.system.name']?.value).toBe('mysql');
  expect(firstQuery!.attributes['db.query.text']?.value).toBe('SELECT 1 + 1 AS solution');
  expect(firstQuery!.attributes['server.address']?.value).toBe('127.0.0.1');
  expect(firstQuery!.attributes['server.port']?.value).toBe(3306);
  expect(firstQuery!.attributes['db.user']?.value).toBe('root');
});

test('a nested query lands on the same trace (async context restored)', async ({ request }) => {
  const spansPromise = collectStreamedSpans(
    APP_NAME,
    spans =>
      spans.some(span => getSpanOp(span) === 'http.server' && span.is_segment) &&
      spans.filter(span => getSpanOp(span) === 'db').length >= 2,
  );

  const res = await request.get('/db-mysql');
  expect(res.status()).toBe(200);

  const spans = await spansPromise;
  const queryTexts = spans
    .filter(span => getSpanOp(span) === 'db')
    .map(span => span.attributes['db.query.text']?.value);
  expect(queryTexts).toContain('SELECT 1 + 1 AS solution');
  expect(queryTexts).toContain('SELECT NOW()');
});
