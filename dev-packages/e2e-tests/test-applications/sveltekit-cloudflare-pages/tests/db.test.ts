import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp } from '@sentry-internal/test-utils';

test('a real mysql query emits a db span with orchestrion-channel attributes', async ({ baseURL }) => {
  // The `orchestrion:mysql:query` channel is injected into the bundled `mysql` package at
  // build time by `@sentry/sveltekit`, which — because this app uses the Cloudflare adapter —
  // also registers the subscriber factory on the global marker that `@sentry/cloudflare` reads
  // in `wrapRequestHandler`. The query below therefore produces a `db` span on the request's
  // http.server trace, with no OTel require-hook (which wouldn't work in workerd).
  const traceSpansPromise = collectStreamedSpans('sveltekit-cloudflare-pages', spansOfTrace => {
    const hasServerSegment = spansOfTrace.some(span => getSpanOp(span) === 'http.server' && span.is_segment);
    return hasServerSegment && spansOfTrace.some(span => getSpanOp(span) === 'db');
  });

  const res = await fetch(`${baseURL}/db-mysql`);
  expect(res.status).toBe(200);

  const traceSpans = await traceSpansPromise;
  const dbSpans = traceSpans.filter(span => getSpanOp(span) === 'db');

  const firstQuery = dbSpans.find(span => span.attributes['db.query.text']?.value === 'SELECT 1 + 1 AS solution');
  expect(firstQuery).toBeDefined();
  expect(firstQuery!.name).toBe('SELECT');
  expect(firstQuery!.attributes).toMatchObject({
    'sentry.origin': { value: 'auto.db.mysql', type: 'string' },
    'db.system.name': { value: 'mysql', type: 'string' },
    'db.query.text': { value: 'SELECT 1 + 1 AS solution', type: 'string' },
    'db.query.summary': { value: 'SELECT', type: 'string' },
    'server.address': { value: '127.0.0.1', type: 'string' },
    'server.port': { value: 3306, type: 'integer' },
    'db.user': { value: 'root', type: 'string' },
  });
});

test('a nested query lands on the same trace (async context restored)', async ({ baseURL }) => {
  // The second query runs inside the first query's callback — i.e. across mysql's async
  // socket-callback dispatch. Both spans appearing on the SAME http.server trace, under the same
  // parent, proves the channel subscriber restored the parent span across that async boundary
  // (otherwise the nested query would start its own trace and never join this one).
  const traceSpansPromise = collectStreamedSpans('sveltekit-cloudflare-pages', spansOfTrace => {
    const hasServerSegment = spansOfTrace.some(span => getSpanOp(span) === 'http.server' && span.is_segment);
    return hasServerSegment && spansOfTrace.filter(span => getSpanOp(span) === 'db').length >= 2;
  });

  const res = await fetch(`${baseURL}/db-mysql`);
  expect(res.status).toBe(200);

  const traceSpans = await traceSpansPromise;
  const dbSpans = traceSpans.filter(span => getSpanOp(span) === 'db');

  const queryTexts = dbSpans.map(span => span.attributes['db.query.text']?.value);
  expect(queryTexts).toContain('SELECT 1 + 1 AS solution');
  expect(queryTexts).toContain('SELECT NOW()');

  const parentSpanIds = new Set(dbSpans.map(span => span.parent_span_id));
  expect(parentSpanIds.size).toBe(1);
});
