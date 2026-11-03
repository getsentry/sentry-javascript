// <reference lib="deno.ns" />

import { EventEmitter } from 'node:events';
import { tracingChannel } from 'node:diagnostics_channel';
import type { DenoClient } from '@sentry/deno';
import { flush, init, startSpan } from '@sentry/deno';
import { assert } from 'https://deno.land/std@0.212.0/assert/assert.ts';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';
import { assertExists } from 'https://deno.land/std@0.212.0/assert/assert_exists.ts';
import { getSpanOp, resetGlobals, spanSink, withTimeout } from '../../src/index.ts';

Deno.test('tedious instrumentation: included in default integrations (Deno 2.8.0+)', () => {
  resetGlobals();
  const client = init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
  }) as DenoClient;
  const names = client.getOptions().integrations.map(i => i.name);
  assert(names.includes('Tedious'), `Tedious should be in defaults, got ${names.join(', ')}`);
});

Deno.test('tedious instrumentation: orchestrion:tedious:execSql channel produces a nested db span', async () => {
  resetGlobals();
  const sink = spanSink();
  init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    transport: sink.transport,
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

  await flush();

  const parent = await withTimeout(
    sink.waitFor(span => span.is_segment && span.name === 'parent'),
    5000,
    "'parent' segment span",
  );
  const children = sink.spans.filter(span => span.parent_span_id === parent.span_id);
  assertEquals(children.length, 1);
  assertEquals(children[0]!.trace_id, parent.trace_id);
  assertEquals(children[0]!.is_segment, false);

  const tediousSpan = children.find(s => getSpanOp(s) === 'db');
  assertExists(tediousSpan, `expected a db child span, got ops: ${children.map(s => getSpanOp(s)).join(', ')}`);
  assertEquals(tediousSpan.name, 'SELECT');
  assertEquals(tediousSpan.attributes['db.system.name']?.value, 'mssql');
  assertEquals(tediousSpan.attributes['db.namespace']?.value, 'mydb');
  assertEquals(tediousSpan.attributes['db.user']?.value, 'sa');
  assertEquals(tediousSpan.attributes['db.query.text']?.value, 'SELECT ?');
  assertEquals(tediousSpan.attributes['server.address']?.value, '127.0.0.1');
  assertEquals(tediousSpan.attributes['server.port']?.value, 1433);
  assertEquals(tediousSpan.attributes['sentry.origin']?.value, 'auto.db.tedious');
});
