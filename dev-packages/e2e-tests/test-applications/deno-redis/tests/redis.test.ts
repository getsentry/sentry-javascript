import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('GET command emits an http.server transaction containing a db.redis child span', async ({ baseURL }) => {
  // Each incoming request gets a Sentry http.server transaction (via the
  // default denoServeIntegration); the redis command runs inside it, so the
  // child span attaches to that transaction.
  const transactionPromise = waitForTransaction('deno-redis', event => {
    return (
      event?.contexts?.trace?.op === 'http.server' &&
      (event.request?.url ?? '').includes('/redis-get') &&
      (event.spans?.some(span => span.op === 'db.redis') ?? false)
    );
  });

  const res = await fetch(`${baseURL}/redis-get?key=cache:user:42`);
  expect(res.status).toBe(200);
  await res.json();

  const transaction = await transactionPromise;
  const redisSpan = transaction.spans!.find(span => span.op === 'db.redis');
  expect(redisSpan).toBeDefined();
  expect(redisSpan!.description).toBe('redis-GET');
  expect(redisSpan!.data?.['db.system']).toBe('redis');
  // Statement omits the value; for GET the only allowed arg is the key.
  expect(redisSpan!.data?.['db.statement']).toBe('GET cache:user:42');
  expect(redisSpan!.data?.['net.peer.port']).toBe(6379);
});

test('SET then GET emit two db.redis child spans on the same transaction', async ({ baseURL }) => {
  const transactionPromise = waitForTransaction('deno-redis', event => {
    return (
      event?.contexts?.trace?.op === 'http.server' &&
      (event.request?.url ?? '').includes('/redis-set-get') &&
      (event.spans?.filter(span => span.op === 'db.redis').length ?? 0) >= 2
    );
  });

  const res = await fetch(`${baseURL}/redis-set-get?key=cache:greeting&value=hello`);
  expect(res.status).toBe(200);
  await res.json();

  const transaction = await transactionPromise;
  const redisSpans = transaction.spans!.filter(span => span.op === 'db.redis');
  expect(redisSpans.length).toBeGreaterThanOrEqual(2);
  const ops = redisSpans.map(s => s.description);
  expect(ops).toContain('redis-SET');
  expect(ops).toContain('redis-GET');
});

test('MULTI batch emits a PIPELINE/MULTI batch span', async ({ baseURL }) => {
  const transactionPromise = waitForTransaction('deno-redis', event => {
    return (
      event?.contexts?.trace?.op === 'http.server' &&
      (event.request?.url ?? '').includes('/redis-multi') &&
      (event.spans?.some(span => span.description === 'MULTI' || span.description === 'PIPELINE') ?? false)
    );
  });

  const res = await fetch(`${baseURL}/redis-multi`);
  expect(res.status).toBe(200);
  await res.json();

  const transaction = await transactionPromise;
  const batchSpan = transaction.spans!.find(span => span.description === 'MULTI' || span.description === 'PIPELINE');
  expect(batchSpan).toBeDefined();
  expect(batchSpan!.op).toBe('db.redis');
  expect(batchSpan!.data?.['db.system']).toBe('redis');
});

test('shut down redis client', async ({ baseURL }) => {
  const res = await fetch(`${baseURL}/redis-disconnect`);
  expect(await res.text()).toBe('ok');
});
