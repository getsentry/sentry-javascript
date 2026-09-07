import { expect, test } from '@playwright/test';
import { collectStreamedSpansUntilSegment, getSpanOp } from '@sentry-internal/test-utils';

// The Nuxt module auto-wires the orchestrion build-time transform, which injects
// `diagnostics_channel` publishers into these drivers as Nitro bundles them. That
// only happens in the production build, so these tests are excluded from the
// `test:dev` pass (which filters to `environment`).

// Exact-match API routes keep a bare method-only segment name under h3 v1, so the
// segment is selected via its `url.path` attribute. Driver spans can flush before
// the segment, so accumulate until the segment arrives and filter by its trace.
async function collectRequestSpans(path: string) {
  const spans = await collectStreamedSpansUntilSegment('nuxt-4', span => span.attributes['url.path']?.value === path);
  const rootSpan = spans.find(span => span.is_segment && span.attributes['url.path']?.value === path);

  return spans.filter(span => span.trace_id === rootSpan?.trace_id);
}

test('Instruments ioredis automatically', async ({ baseURL }) => {
  const spansPromise = collectRequestSpans('/api/db-ioredis');

  const response = await fetch(`${baseURL}/api/db-ioredis`);
  expect(response.status).toBe(200);
  expect(await response.text()).toBe('test-value');

  const spans = await spansPromise;

  const rootSpan = spans.find(span => span.is_segment);
  expect(rootSpan).toBeDefined();
  expect(getSpanOp(rootSpan!)).toBe('http.server');

  expect(spans).toContainEqual(
    expect.objectContaining({
      name: 'set localhost:6379',
      status: 'ok',
      is_segment: false,
      attributes: expect.objectContaining({
        'sentry.op': { type: 'string', value: 'db.query' },
        'sentry.origin': { type: 'string', value: 'auto.db.redis' },
        'db.system.name': { type: 'string', value: 'redis' },
        'db.operation.name': { type: 'string', value: 'set' },
        'db.query.text': { type: 'string', value: 'set test-key [1 other arguments]' },
        'server.address': { type: 'string', value: 'localhost' },
        'server.port': { type: 'integer', value: 6379 },
      }),
    }),
  );
  expect(spans).toContainEqual(
    expect.objectContaining({
      name: 'get localhost:6379',
      status: 'ok',
      is_segment: false,
      attributes: expect.objectContaining({
        'sentry.op': { type: 'string', value: 'db.query' },
        'sentry.origin': { type: 'string', value: 'auto.db.redis' },
        'db.system.name': { type: 'string', value: 'redis' },
        'db.operation.name': { type: 'string', value: 'get' },
        'db.query.text': { type: 'string', value: 'get test-key' },
        'server.address': { type: 'string', value: 'localhost' },
        'server.port': { type: 'integer', value: 6379 },
      }),
    }),
  );
});

test('Instruments mysql automatically', async ({ baseURL }) => {
  const spansPromise = collectRequestSpans('/api/db-mysql');

  const response = await fetch(`${baseURL}/api/db-mysql`);
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ status: 'ok' });

  const spans = await spansPromise;

  // Neither query has a FROM target, so the low-cardinality summary (and streamed
  // span name) is just the operation. The raw SQL stays on `db.query.text`.
  expect(spans).toContainEqual(
    expect.objectContaining({
      name: 'SELECT',
      status: 'ok',
      is_segment: false,
      attributes: expect.objectContaining({
        'sentry.op': { type: 'string', value: 'db' },
        'sentry.origin': { type: 'string', value: 'auto.db.mysql' },
        'db.system.name': { type: 'string', value: 'mysql' },
        'db.query.text': { type: 'string', value: 'SELECT 1 + 1 AS solution' },
        'db.query.summary': { type: 'string', value: 'SELECT' },
        'db.user': { type: 'string', value: 'root' },
        'db.connection_string': { type: 'string', value: expect.any(String) },
        'server.address': { type: 'string', value: expect.any(String) },
        'server.port': { type: 'integer', value: 3306 },
      }),
    }),
  );
  expect(spans).toContainEqual(
    expect.objectContaining({
      name: 'SELECT',
      status: 'ok',
      is_segment: false,
      attributes: expect.objectContaining({
        'sentry.op': { type: 'string', value: 'db' },
        'sentry.origin': { type: 'string', value: 'auto.db.mysql' },
        'db.system.name': { type: 'string', value: 'mysql' },
        'db.query.text': { type: 'string', value: 'SELECT NOW()' },
        'db.query.summary': { type: 'string', value: 'SELECT' },
        'db.user': { type: 'string', value: 'root' },
        'db.connection_string': { type: 'string', value: expect.any(String) },
        'server.address': { type: 'string', value: expect.any(String) },
        'server.port': { type: 'integer', value: 3306 },
      }),
    }),
  );
});
