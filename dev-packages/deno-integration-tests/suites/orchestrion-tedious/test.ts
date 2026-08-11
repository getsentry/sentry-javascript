// <reference lib="deno.ns" />

import { EventEmitter } from 'node:events';
import { tracingChannel } from 'node:diagnostics_channel';
import type { DenoClient } from '@sentry/deno';
import { init, startSpan } from '@sentry/deno';
import { assert } from 'https://deno.land/std@0.212.0/assert/assert.ts';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';
import { assertExists } from 'https://deno.land/std@0.212.0/assert/assert_exists.ts';
import { resetGlobals, transactionSink, withTimeout } from '../../src/index.ts';

Deno.test('tedious instrumentation: included in default integrations (Deno 2.8.0+)', () => {
  resetGlobals();
  const client = init({ traceLifecycle: 'static', dsn: 'https://username@domain/123' }) as DenoClient;
  const names = client.getOptions().integrations.map(i => i.name);
  assert(names.includes('Tedious'), `Tedious should be in defaults, got ${names.join(', ')}`);
});

Deno.test('tedious instrumentation: orchestrion:tedious:execSql channel produces a nested db span', async () => {
  resetGlobals();
  const sink = transactionSink();
  init({
    traceLifecycle: 'static',
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    beforeSendTransaction: sink.beforeSendTransaction,
  });

  // The connection and request are `EventEmitter`s; the subscriber only traces
  // when `arguments[0]` is one, and ends the span from the request's callback.
  const connection = Object.assign(new EventEmitter(), {
    config: { server: '127.0.0.1', userName: 'sa', options: { database: 'mydb', port: 1433 } },
  });
  const request = Object.assign(new EventEmitter(), {
    sqlTextOrProcedure: 'SELECT 1',
    callback: (..._args: unknown[]) => undefined,
  });

  // `connect` seeds the connection's current database, read into `db.name`.
  tracingChannel('orchestrion:tedious:connect').start.publish({ self: connection, arguments: [] });

  startSpan({ name: 'parent', op: 'test' }, () => {
    tracingChannel('orchestrion:tedious:execSql').start.publish({ self: connection, arguments: [request] });
    // tedious signals completion via the request callback; the wrapper ends the span.
    request.callback();
  });

  const parent = await withTimeout(
    sink.waitFor(t => t.transaction === 'parent'),
    5000,
    "'parent' transaction",
  );

  const tediousSpan = parent.spans?.find(s => s.op === 'db');
  assertExists(tediousSpan, `expected a db child span, got ops: ${parent.spans?.map(s => s.op).join(', ')}`);
  assertEquals(tediousSpan!.description, 'SELECT 1');
  assertEquals(tediousSpan!.data?.['db.system'], 'mssql');
  assertEquals(tediousSpan!.data?.['db.name'], 'mydb');
  assertEquals(tediousSpan!.data?.['db.user'], 'sa');
  assertEquals(tediousSpan!.data?.['db.statement'], 'SELECT 1');
  assertEquals(tediousSpan!.data?.['server.address'], '127.0.0.1');
  assertEquals(tediousSpan!.data?.['network.peer.port'], 1433);
  assertEquals(tediousSpan!.data?.['sentry.origin'], 'auto.db.tedious');
});
