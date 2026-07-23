// <reference lib="deno.ns" />

import { tracingChannel } from 'node:diagnostics_channel';
import type { TransactionEvent } from '@sentry/core';
import type { DenoClient } from '@sentry/deno';
import { getCurrentScope, getGlobalScope, getIsolationScope, init, startSpan } from '@sentry/deno';
import { assert } from 'https://deno.land/std@0.212.0/assert/assert.ts';
import { assertExists } from 'https://deno.land/std@0.212.0/assert/assert_exists.ts';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';

function resetGlobals(): void {
  getCurrentScope().clear();
  getCurrentScope().setClient(undefined);
  getIsolationScope().clear();
  getGlobalScope().clear();
}

/** See deno-redis.test.ts — same sink shape, deduped for clarity. */
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

Deno.test('koa instrumentation: included in default integrations (Deno 2.8.0+)', () => {
  resetGlobals();
  const client = init({ dsn: 'https://username@domain/123' }) as DenoClient;
  const names = client.getOptions().integrations.map(i => i.name);
  assert(names.includes('Koa'), `Koa should be in defaults, got ${names.join(', ')}`);
});

// Exercises the SDK path end-to-end. Unlike the db integrations, koa's channel
// doesn't build a span directly: its `start` handler wraps the registered
// middleware (arg 0) in a span-creating proxy, and the span opens when that
// middleware later runs under an active span. So we publish `orchestrion:koa:use`
// with a middleware, then invoke the wrapped middleware inside a parent span —
// the same shape `app.use(fn)` then a request produces. Asserting a nested
// `middleware.koa` span proves the subscriber and context wiring work.
Deno.test('koa instrumentation: orchestrion:koa:use channel wraps middleware into a span', async () => {
  resetGlobals();
  const sink = transactionSink();
  init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    beforeSendTransaction: sink.beforeSendTransaction,
  });

  function myMiddleware(_context: unknown, next: () => Promise<unknown>): Promise<unknown> {
    return next();
  }

  // Publishing `start` runs the subscriber, which patches `arguments[0]` in place.
  const ctx = { arguments: [myMiddleware] as unknown[] };
  tracingChannel('orchestrion:koa:use').start.publish(ctx);
  const wrappedMiddleware = ctx.arguments[0] as typeof myMiddleware;

  await startSpan({ name: 'parent', op: 'test' }, async () => {
    await wrappedMiddleware({}, () => Promise.resolve());
  });

  const parent = await withTimeout(
    sink.waitFor(t => t.transaction === 'parent'),
    5000,
    "'parent' transaction",
  );

  const koaSpan = parent.spans?.find(s => s.op === 'middleware.koa');
  assertExists(koaSpan, `expected a middleware.koa child span, got ops: ${parent.spans?.map(s => s.op).join(', ')}`);
  assertEquals(koaSpan!.description, 'myMiddleware');
  assertEquals(koaSpan!.data?.['sentry.origin'], 'auto.http.orchestrion.koa');
});
