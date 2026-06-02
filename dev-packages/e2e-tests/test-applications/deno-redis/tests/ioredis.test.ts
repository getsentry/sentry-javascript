import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('ioredis GET emits an http.server transaction containing a db.redis child span', async ({ baseURL }) => {
  // Each incoming request gets a Sentry http.server transaction (via the
  // default denoServeIntegration); the ioredis command runs inside it, so the
  // child span attaches to that transaction.
  const transactionPromise = waitForTransaction('deno-redis', event => {
    return (
      event?.contexts?.trace?.op === 'http.server' &&
      (event.request?.url ?? '').includes('/ioredis-get') &&
      (event.spans?.some(span => span.op === 'db.redis') ?? false)
    );
  });

  const res = await fetch(`${baseURL}/ioredis-get?key=iocache:user:42`);
  expect(res.status).toBe(200);
  await res.json();

  const transaction = await transactionPromise;
  const redisSpan = transaction.spans!.find(span => span.op === 'db.redis');
  expect(redisSpan).toBeDefined();
  // ioredis publishes lowercase command names; node-redis publishes uppercase.
  expect(redisSpan!.description).toBe('redis-get');
  expect(redisSpan!.data?.['db.system']).toBe('redis');
  expect(redisSpan!.data?.['db.statement']).toBe('get iocache:user:42');
});

test('ioredis SET then GET emit two db.redis child spans on the same transaction', async ({ baseURL }) => {
  const transactionPromise = waitForTransaction('deno-redis', event => {
    return (
      event?.contexts?.trace?.op === 'http.server' &&
      (event.request?.url ?? '').includes('/ioredis-set-get') &&
      (event.spans?.filter(span => span.op === 'db.redis').length ?? 0) >= 2
    );
  });

  const res = await fetch(`${baseURL}/ioredis-set-get?key=iocache:greeting&value=hello`);
  expect(res.status).toBe(200);
  await res.json();

  const transaction = await transactionPromise;
  const redisSpans = transaction.spans!.filter(span => span.op === 'db.redis');
  expect(redisSpans.length).toBeGreaterThanOrEqual(2);
  const ops = redisSpans.map(s => s.description);
  expect(ops).toContain('redis-set');
  expect(ops).toContain('redis-get');
});

test('ioredis MULTI emits one db.redis span per command (no batch channel)', async ({ baseURL }) => {
  // ioredis does not publish to a batch channel — each command in the
  // transaction publishes individually with batchMode/batchSize set on its
  // own payload. So the transaction should contain multiple `redis-<cmd>`
  // child spans, but no PIPELINE/MULTI batch span.
  const transactionPromise = waitForTransaction('deno-redis', event => {
    return (
      event?.contexts?.trace?.op === 'http.server' &&
      (event.request?.url ?? '').includes('/ioredis-multi') &&
      (event.spans?.filter(span => span.op === 'db.redis').length ?? 0) >= 3
    );
  });

  const res = await fetch(`${baseURL}/ioredis-multi`);
  expect(res.status).toBe(200);
  await res.json();

  const transaction = await transactionPromise;
  const redisSpans = transaction.spans!.filter(span => span.op === 'db.redis');
  expect(redisSpans.length).toBeGreaterThanOrEqual(3);
  const descriptions = redisSpans.map(s => s.description);
  expect(descriptions).toContain('redis-set');
  expect(descriptions).toContain('redis-get');
  // No PIPELINE/MULTI batch wrapper span — ioredis has no separate batch channel.
  const batchSpan = transaction.spans!.find(span => span.description === 'MULTI' || span.description === 'PIPELINE');
  expect(batchSpan).toBeUndefined();
});

test('ioredis PIPELINE emits one db.redis span per command', async ({ baseURL }) => {
  const transactionPromise = waitForTransaction('deno-redis', event => {
    return (
      event?.contexts?.trace?.op === 'http.server' &&
      (event.request?.url ?? '').includes('/ioredis-pipeline') &&
      (event.spans?.filter(span => span.op === 'db.redis').length ?? 0) >= 3
    );
  });

  const res = await fetch(`${baseURL}/ioredis-pipeline`);
  expect(res.status).toBe(200);
  await res.json();

  const transaction = await transactionPromise;
  const redisSpans = transaction.spans!.filter(span => span.op === 'db.redis');
  expect(redisSpans.length).toBeGreaterThanOrEqual(3);
});
