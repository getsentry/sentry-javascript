// <reference lib="deno.ns" />

import { tracingChannel } from 'node:diagnostics_channel';
import type { TransactionEvent } from '@sentry/core';
import type { DenoClient } from '@sentry/deno';
import { getCurrentScope, getGlobalScope, getIsolationScope, init, startSpan } from '@sentry/deno';
import { assert } from 'https://deno.land/std@0.212.0/assert/assert.ts';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';
import { assertExists } from 'https://deno.land/std@0.212.0/assert/assert_exists.ts';

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

Deno.test('mysql2 instrumentation: included in default integrations (Deno 2.8.0+)', () => {
  resetGlobals();
  const client = init({ dsn: 'https://username@domain/123' }) as DenoClient;
  const names = client.getOptions().integrations.map(i => i.name);
  assert(names.includes('Mysql2'), `Mysql2 should be in defaults, got ${names.join(', ')}`);
});

Deno.test('mysql2 instrumentation: orchestrion:mysql2:query channel produces a nested db span', async () => {
  resetGlobals();
  const sink = transactionSink();
  init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    beforeSendTransaction: sink.beforeSendTransaction,
  });

  const channel = tracingChannel('orchestrion:mysql2:query');

  // `arguments[0]` is the SQL; `self.config` is the mysql2 connection config.
  const ctx = {
    arguments: ['SELECT 1 AS solution'],
    self: { config: { host: '127.0.0.1', port: 3306, database: 'mydb', user: 'root' } },
  };

  startSpan({ name: 'parent', op: 'test' }, () => {
    channel.start.runStores(ctx, () => {
      channel.end.publish(ctx);
    });
    channel.asyncStart.runStores(ctx, () => {
      channel.asyncEnd.publish(ctx);
    });
  });

  const parent = await withTimeout(
    sink.waitFor(t => t.transaction === 'parent'),
    5000,
    "'parent' transaction",
  );

  const mysqlSpan = parent.spans?.find(s => s.op === 'db');
  assertExists(mysqlSpan, `expected a db child span, got ops: ${parent.spans?.map(s => s.op).join(', ')}`);
  assertEquals(mysqlSpan!.description, 'SELECT 1 AS solution');
  assertEquals(mysqlSpan!.data?.['db.system'], 'mysql');
  assertEquals(mysqlSpan!.data?.['db.statement'], 'SELECT 1 AS solution');
  assertEquals(mysqlSpan!.data?.['db.name'], 'mydb');
  assertEquals(mysqlSpan!.data?.['db.user'], 'root');
  assertEquals(mysqlSpan!.data?.['net.peer.name'], '127.0.0.1');
  assertEquals(mysqlSpan!.data?.['net.peer.port'], 3306);
  assertEquals(mysqlSpan!.data?.['sentry.origin'], 'auto.db.orchestrion.mysql2');
});
