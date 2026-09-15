import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp } from '@sentry-internal/test-utils';
import type { SerializedStreamedSpan } from '@sentry/core';

// `Deno.serve` has no route information, so with span streaming the http.server segment is
// named after the method only; the path lives in `url.path`.
function isSegmentFor(path: string): (span: SerializedStreamedSpan) => boolean {
  return span => getSpanOp(span) === 'http.server' && span.is_segment && span.attributes['url.path']?.value === path;
}

function isRedisCommand(span: SerializedStreamedSpan): boolean {
  return getSpanOp(span) === 'db.query';
}

// `db.query.text` carries the key, so with span streaming a redis command span is named
// `{db.operation.name} {server.address}:{server.port}` instead.
function expectedCommandName(span: SerializedStreamedSpan): string {
  const { 'db.operation.name': operation, 'server.address': address, 'server.port': port } = span.attributes;
  return `${operation?.value} ${address?.value}:${port?.value}`;
}

test('GET command emits an http.server segment containing a db.query child span', async ({ baseURL }) => {
  // Each incoming request gets a Sentry http.server segment span (via the
  // default denoServeIntegration); the redis command runs inside it, so the
  // child span joins that trace.
  const spansPromise = collectStreamedSpans(
    'deno-redis',
    spans => spans.some(isSegmentFor('/redis-get')) && spans.some(isRedisCommand),
  );

  const res = await fetch(`${baseURL}/redis-get?key=cache:user:42`);
  expect(res.status).toBe(200);
  await res.json();

  const spans = await spansPromise;
  const segment = spans.find(isSegmentFor('/redis-get'))!;
  const redisSpan = spans.find(isRedisCommand);
  expect(redisSpan).toBeDefined();
  expect(redisSpan!.parent_span_id).toBe(segment.span_id);
  expect(redisSpan!.name).toBe(expectedCommandName(redisSpan!));
  expect(redisSpan!.attributes).toMatchObject({
    'db.system.name': { value: 'redis', type: 'string' },
    'db.operation.name': { value: 'GET', type: 'string' },
    // Statement omits the value; for GET the only allowed arg is the key.
    'db.query.text': { value: 'GET cache:user:42', type: 'string' },
    'server.port': { value: 6379, type: 'integer' },
  });
});

test('SET then GET emit two db.query child spans on the same trace', async ({ baseURL }) => {
  const spansPromise = collectStreamedSpans(
    'deno-redis',
    spans => spans.some(isSegmentFor('/redis-set-get')) && spans.filter(isRedisCommand).length >= 2,
  );

  const res = await fetch(`${baseURL}/redis-set-get?key=cache:greeting&value=hello`);
  expect(res.status).toBe(200);
  await res.json();

  const spans = await spansPromise;
  const segment = spans.find(isSegmentFor('/redis-set-get'))!;
  const redisSpans = spans.filter(isRedisCommand);
  expect(redisSpans.length).toBeGreaterThanOrEqual(2);
  expect(redisSpans.every(span => span.parent_span_id === segment.span_id)).toBe(true);
  const ops = redisSpans.map(span => span.attributes['db.operation.name']?.value);
  expect(ops).toContain('SET');
  expect(ops).toContain('GET');
});

test('MULTI batch emits a PIPELINE/MULTI batch span', async ({ baseURL }) => {
  const isBatchSpan = (span: SerializedStreamedSpan) => span.name === 'MULTI' || span.name === 'PIPELINE';

  const spansPromise = collectStreamedSpans(
    'deno-redis',
    spans => spans.some(isSegmentFor('/redis-multi')) && spans.some(isBatchSpan),
  );

  const res = await fetch(`${baseURL}/redis-multi`);
  expect(res.status).toBe(200);
  await res.json();

  const spans = await spansPromise;
  const batchSpan = spans.find(isBatchSpan);
  expect(batchSpan).toBeDefined();
  expect(getSpanOp(batchSpan!)).toBe('db.query');
  expect(batchSpan!.attributes['db.system.name']?.value).toBe('redis');
});

test('shut down redis client', async ({ baseURL }) => {
  const res = await fetch(`${baseURL}/redis-disconnect`);
  expect(await res.text()).toBe('ok');
});
