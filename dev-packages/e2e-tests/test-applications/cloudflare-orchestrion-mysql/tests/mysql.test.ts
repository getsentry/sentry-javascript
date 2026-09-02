import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp } from '@sentry-internal/test-utils';

test('a real mysql query emits a db span with orchestrion-channel attributes', async ({ baseURL }) => {
  // Each incoming request gets a Sentry http.server segment span; the mysql
  // queries run inside it, so their db spans share its trace. The
  // `orchestrion:mysql:query` channel was injected into the bundled `mysql`
  // package at build time by `@sentry/cloudflare/vite`, and the Cloudflare SDK
  // subscribes to it once it detects the injection.
  const spansPromise = collectStreamedSpans(
    'cloudflare-orchestrion-mysql',
    spans =>
      spans.some(
        span =>
          getSpanOp(span) === 'http.server' && span.is_segment && span.attributes['url.path']?.value === '/test-mysql',
      ) && spans.some(span => getSpanOp(span) === 'db'),
  );

  const res = await fetch(`${baseURL}/test-mysql`);
  expect(res.status).toBe(200);
  await res.json();

  const spans = await spansPromise;
  const dbSpans = spans.filter(span => getSpanOp(span) === 'db');

  const firstQuery = dbSpans.find(span => span.attributes['db.query.text']?.value === 'SELECT 1 + 1 AS solution');
  expect(firstQuery).toBeDefined();
  // With span streaming the span name is the low-cardinality query summary; the statement stays in `db.query.text`.
  expect(firstQuery!.name).toBe('SELECT');
  expect(firstQuery!.attributes['sentry.origin']?.value).toBe('auto.db.mysql');
  expect(firstQuery!.attributes['db.system.name']?.value).toBe('mysql');
  expect(firstQuery!.attributes['db.query.text']?.value).toBe('SELECT 1 + 1 AS solution');
  expect(firstQuery!.attributes['server.address']?.value).toBe('127.0.0.1');
  expect(firstQuery!.attributes['server.port']?.value).toBe(3306);
  expect(firstQuery!.attributes['db.user']?.value).toBe('root');
});

test('a nested query lands on the same trace (async context restored)', async ({ baseURL }) => {
  // The second query runs inside the first query's callback — i.e. across
  // mysql's async socket-callback dispatch. Both spans sharing the SAME
  // http.server segment's trace proves the channel subscriber restored the
  // parent span across that async boundary (otherwise the nested query would
  // start its own trace and never join this one).
  const spansPromise = collectStreamedSpans(
    'cloudflare-orchestrion-mysql',
    spans =>
      spans.some(
        span =>
          getSpanOp(span) === 'http.server' && span.is_segment && span.attributes['url.path']?.value === '/test-mysql',
      ) && spans.filter(span => getSpanOp(span) === 'db').length >= 2,
  );

  const res = await fetch(`${baseURL}/test-mysql`);
  expect(res.status).toBe(200);
  await res.json();

  const spans = await spansPromise;
  const queryTexts = spans
    .filter(span => getSpanOp(span) === 'db')
    .map(span => span.attributes['db.query.text']?.value);
  expect(queryTexts).toContain('SELECT 1 + 1 AS solution');
  expect(queryTexts).toContain('SELECT NOW()');
});
