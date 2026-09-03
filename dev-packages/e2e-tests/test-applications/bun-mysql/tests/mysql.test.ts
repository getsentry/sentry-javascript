import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp } from '@sentry-internal/test-utils';
import type { SerializedStreamedSpan } from '@sentry/core';

// `Bun.serve` without `routes` has no parameterized route, so with span streaming the
// http.server segment is named after the method only; the path lives in `url.path`.
function isTestMysqlSegment(span: SerializedStreamedSpan): boolean {
  return getSpanOp(span) === 'http.server' && span.is_segment && span.attributes['url.path']?.value === '/test-mysql';
}

test('mysql queries emit a db span with orchestrion-channel attributes', async ({ baseURL }) => {
  // Each incoming request gets a Sentry http.server segment span; the mysql
  // queries run inside it, so their db spans join that trace. The channels
  // were injected at build time by `@sentry/bun/plugin`, and the Bun SDK
  // subscribes to them by default.
  const spansPromise = collectStreamedSpans(
    'bun-mysql',
    spans => spans.some(isTestMysqlSegment) && spans.some(span => getSpanOp(span) === 'db'),
  );

  const res = await fetch(`${baseURL}/test-mysql`);
  expect(res.status).toBe(200);
  await res.json();

  const spans = await spansPromise;
  const dbSpans = spans.filter(span => getSpanOp(span) === 'db');

  const firstQuery = dbSpans.find(span => span.attributes['db.query.text']?.value === 'SELECT 1 + 1 AS solution');
  expect(firstQuery).toBeDefined();
  // With span streaming, db span names are the low-cardinality query summary, not the raw SQL
  expect(firstQuery!.name).toBe('SELECT');
  expect(firstQuery!.attributes).toMatchObject({
    'sentry.origin': { value: 'auto.db.mysql', type: 'string' },
    'db.system.name': { value: 'mysql', type: 'string' },
    'db.query.text': { value: 'SELECT 1 + 1 AS solution', type: 'string' },
    'server.port': { value: 3306, type: 'integer' },
    'db.user': { value: 'root', type: 'string' },
  });
});

test('a nested query lands on the same trace (async context restored)', async ({ baseURL }) => {
  // The second query runs inside the first query's callback — i.e. across
  // mysql's async socket-callback dispatch. Both db spans being children of the
  // SAME http.server segment proves the channel subscriber restored the parent
  // span across that async boundary (otherwise the nested query would start its
  // own trace and never join this one).
  const spansPromise = collectStreamedSpans(
    'bun-mysql',
    spans => spans.some(isTestMysqlSegment) && spans.filter(span => getSpanOp(span) === 'db').length >= 2,
  );

  const res = await fetch(`${baseURL}/test-mysql`);
  expect(res.status).toBe(200);
  await res.json();

  const spans = await spansPromise;
  const segment = spans.find(isTestMysqlSegment)!;
  const dbSpans = spans.filter(span => getSpanOp(span) === 'db');

  const queries = dbSpans.map(span => span.attributes['db.query.text']?.value);
  expect(queries).toContain('SELECT 1 + 1 AS solution');
  expect(queries).toContain('SELECT NOW()');
  expect(dbSpans.every(span => span.parent_span_id === segment.span_id)).toBe(true);
});
