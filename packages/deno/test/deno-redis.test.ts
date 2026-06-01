// <reference lib="deno.ns" />

import { tracingChannel } from 'node:diagnostics_channel';
import type { TransactionEvent } from '@sentry/core';
import { assert } from 'https://deno.land/std@0.212.0/assert/assert.ts';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';
import { assertExists } from 'https://deno.land/std@0.212.0/assert/assert_exists.ts';
import type { DenoClient } from '../build/esm/index.js';
import { getCurrentScope, getGlobalScope, getIsolationScope, init, startSpan } from '../build/esm/index.js';

function resetGlobals(): void {
  getCurrentScope().clear();
  getCurrentScope().setClient(undefined);
  getIsolationScope().clear();
  getGlobalScope().clear();
}

/** See deno-http.test.ts — same sink shape, deduped for clarity. */
function transactionSink(): {
  beforeSendTransaction: (event: TransactionEvent) => null;
  waitFor: (predicate: (event: TransactionEvent) => boolean) => Promise<TransactionEvent>;
} {
  const transactions: TransactionEvent[] = [];
  const waiters: { predicate: (e: TransactionEvent) => boolean; resolve: (e: TransactionEvent) => void }[] = [];
  return {
    beforeSendTransaction(event) {
      transactions.push(event);
      for (let i = waiters.length - 1; i >= 0; i--) {
        const w = waiters[i]!;
        if (w.predicate(event)) {
          waiters.splice(i, 1);
          w.resolve(event);
        }
      }
      return null;
    },
    waitFor(predicate) {
      const already = transactions.find(predicate);
      if (already) return Promise.resolve(already);
      return new Promise<TransactionEvent>(resolve => {
        waiters.push({ predicate, resolve });
      });
    },
  };
}

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out waiting for ${what} after ${ms}ms`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

Deno.test('denoRedisIntegration: included in default integrations', () => {
  resetGlobals();
  const client = init({ dsn: 'https://username@domain/123' }) as DenoClient;
  const names = client.getOptions().integrations.map(i => i.name);
  assert(names.includes('DenoRedis'), `DenoRedis should be in defaults, got ${names.join(', ')}`);
});

Deno.test('denoRedisIntegration: node-redis:command channel produces a db.redis child span', async () => {
  resetGlobals();
  const sink = transactionSink();
  init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    beforeSendTransaction: sink.beforeSendTransaction,
  });

  const channel = tracingChannel('node-redis:command');

  // Simulate node-redis publishing a successful GET command around an async op.
  // tracePromise fires start → asyncStart → asyncEnd in sequence and stores
  // any thrown/rejected error on the data object for our error subscriber.
  await startSpan({ name: 'parent', op: 'test' }, async () => {
    await channel.tracePromise(() => Promise.resolve('hit-value'), {
      command: 'GET',
      args: ['GET', 'cache:key'],
      serverAddress: '127.0.0.1',
      serverPort: 6379,
    });
  });

  const parent = await withTimeout(
    sink.waitFor(t => t.transaction === 'parent'),
    5000,
    "'parent' transaction",
  );

  const redisSpan = parent.spans?.find(s => s.op === 'db.redis');
  assertExists(redisSpan, `expected a db.redis child span, got ops: ${parent.spans?.map(s => s.op).join(', ')}`);
  assertEquals(redisSpan!.description, 'redis-GET');
  assertEquals(redisSpan!.data?.['db.system'], 'redis');
  assertEquals(redisSpan!.data?.['db.statement'], 'GET cache:key');
  assertEquals(redisSpan!.data?.['net.peer.name'], '127.0.0.1');
  assertEquals(redisSpan!.data?.['net.peer.port'], 6379);
});

Deno.test('denoRedisIntegration: errors on the command channel set span status', async () => {
  resetGlobals();
  const sink = transactionSink();
  init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    beforeSendTransaction: sink.beforeSendTransaction,
  });

  const channel = tracingChannel('node-redis:command');

  await startSpan({ name: 'parent', op: 'test' }, async () => {
    try {
      await channel.tracePromise(() => Promise.reject(new Error('ECONNREFUSED')), {
        command: 'SET',
        args: ['SET', 'k', 'v'],
      });
    } catch {
      // swallow — we are observing via Sentry, not via control flow
    }
  });

  const parent = await withTimeout(
    sink.waitFor(t => t.transaction === 'parent'),
    5000,
    "'parent' transaction",
  );
  const redisSpan = parent.spans?.find(s => s.op === 'db.redis');
  assertExists(redisSpan, `expected a db.redis child span, got ops: ${parent.spans?.map(s => s.op).join(', ')}`);
  // Sentry serializes a span with `setStatus({ code: SPAN_STATUS_ERROR, message: 'X' })`
  // as `status: 'X'` (the message takes the slot). Both "not ok" and the
  // forwarded message confirm the error path fired.
  assert(redisSpan!.status && redisSpan!.status !== 'ok', `expected error-shaped status, got ${redisSpan!.status}`);
  assertEquals(redisSpan!.status, 'ECONNREFUSED');
});

Deno.test('denoRedisIntegration: ioredis:command channel produces a db.redis child span', async () => {
  resetGlobals();
  const sink = transactionSink();
  init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    beforeSendTransaction: sink.beforeSendTransaction,
  });

  const channel = tracingChannel('ioredis:command');

  // ioredis passes args without the command name prefix, unlike node-redis.
  await startSpan({ name: 'parent', op: 'test' }, async () => {
    await channel.tracePromise(() => Promise.resolve('hit-value'), {
      command: 'get',
      args: ['cache:key'],
      serverAddress: '127.0.0.1',
      serverPort: 6379,
    });
  });

  const parent = await withTimeout(
    sink.waitFor(t => t.transaction === 'parent'),
    5000,
    "'parent' transaction",
  );

  const redisSpan = parent.spans?.find(s => s.op === 'db.redis');
  assertExists(redisSpan, `expected a db.redis child span, got ops: ${parent.spans?.map(s => s.op).join(', ')}`);
  assertEquals(redisSpan!.description, 'redis-get');
  assertEquals(redisSpan!.data?.['db.system'], 'redis');
  assertEquals(redisSpan!.data?.['db.statement'], 'get cache:key');
  assertEquals(redisSpan!.data?.['net.peer.name'], '127.0.0.1');
  assertEquals(redisSpan!.data?.['net.peer.port'], 6379);
});
