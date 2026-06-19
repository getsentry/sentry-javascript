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

Deno.test('denoMysqlIntegration: included in default integrations (Deno 2.8.0+)', () => {
  resetGlobals();
  const client = init({ dsn: 'https://username@domain/123' }) as DenoClient;
  const names = client.getOptions().integrations.map(i => i.name);
  assert(names.includes('DenoMysql'), `DenoMysql should be in defaults, got ${names.join(', ')}`);
});

// The orchestrion runtime hook (`@sentry/deno/import`) only works as a FIRST
// import inside the entry graph in Deno 2.8.0 through 2.8.2.
// TODO: revisit a `--import` or `--preload` approach once Deno 2.8.3 ships.
Deno.test('@sentry/deno/import: transforms mysql so it publishes the orchestrion channel', async () => {
  const scenario = new URL('./orchestrion-mysql/scenario.mjs', import.meta.url);

  // packages/deno — where node_modules resolves
  const cwd = new URL('../', import.meta.url);

  const command = new Deno.Command('deno', {
    args: ['run', '--allow-all', scenario.pathname],
    cwd: cwd.pathname,
    stdout: 'piped',
    stderr: 'piped',
  });

  const { code, stdout, stderr } = await command.output();
  const out = new TextDecoder().decode(stdout);
  const err = new TextDecoder().decode(stderr);

  assertEquals(code, 0, `scenario exited ${code}\nstdout:\n${out}\nstderr:\n${err}`);

  const line = out.split('\n').find(l => l.startsWith('SCENARIO')) ?? '';
  assert(line, `no SCENARIO line in output:\n${out}\nstderr:\n${err}`);
  // The injected channel fired on `connection.query()`
  // proves mysql was transformed...
  assert(line.includes('events=start'), `expected channel 'start' event, got: ${line}`);
  // ...with the real SQL forwarded through the channel context.
  assert(line.includes('statement=SELECT 1 AS solution'), `expected forwarded SQL, got: ${line}`);
  // The runtime hook set its detection marker at boot.
  assert(line.includes('"runtime":true'), `expected runtime marker, got: ${line}`);
});

// Exercises the SDK path end-to-end: `init()` wires `denoMysqlIntegration`
// (which installs the AsyncLocalStorage context strategy and subscribes to the
// channel), and we drive the `orchestrion:mysql:query` channel manually — the
// same events the orchestrion transform publishes around `connection.query()` —
// so no live database is needed. Asserting a nested `db` span proves the
// subscriber, the emitted attributes, AND the context-strategy wiring all work.
Deno.test('denoMysqlIntegration: orchestrion:mysql:query channel produces a nested db span', async () => {
  resetGlobals();
  const sink = transactionSink();
  init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    beforeSendTransaction: sink.beforeSendTransaction,
  });

  const channel = tracingChannel('orchestrion:mysql:query');

  // The shared context object orchestrion reuses across the lifecycle events.
  // `arguments[0]` is the SQL; `self.config` is the mysql connection config.
  const ctx = {
    arguments: ['SELECT 1 AS solution'],
    self: { config: { host: '127.0.0.1', port: 3306, database: 'mydb', user: 'root' } },
  };

  // Callback-success order published by orchestrion's transform:
  // start → end → asyncStart → asyncEnd (the span closes on asyncEnd).
  startSpan({ name: 'parent', op: 'test' }, () => {
    channel.start.publish(ctx);
    channel.end.publish(ctx);
    channel.asyncStart.publish(ctx);
    channel.asyncEnd.publish(ctx);
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
  assertEquals(mysqlSpan!.data?.['net.peer.name'], '127.0.0.1');
  assertEquals(mysqlSpan!.data?.['net.peer.port'], 3306);
  assertEquals(mysqlSpan!.data?.['db.user'], 'root');
  assertEquals(mysqlSpan!.data?.['sentry.origin'], 'auto.db.orchestrion.mysql');
});
