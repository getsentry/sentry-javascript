// <reference lib="deno.ns" />

import { tracingChannel } from 'node:diagnostics_channel';
import type { DenoClient } from '@sentry/deno';
import { flush, init, startSpan } from '@sentry/deno';
import { assert } from 'https://deno.land/std@0.212.0/assert/assert.ts';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';
import { assertExists } from 'https://deno.land/std@0.212.0/assert/assert_exists.ts';
import { getSpanOp, resetGlobals, spanSink, withTimeout } from '../../src/index.ts';

Deno.test('mysql2 instrumentation: included in default integrations (Deno 2.8.0+)', () => {
  resetGlobals();
  const client = init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
  }) as DenoClient;
  const names = client.getOptions().integrations.map(i => i.name);
  assert(names.includes('Mysql2'), `Mysql2 should be in defaults, got ${names.join(', ')}`);
});

Deno.test('mysql2 instrumentation: orchestrion:mysql2:query channel produces a nested db span', async () => {
  resetGlobals();
  const sink = spanSink();
  init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    transport: sink.transport,
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

  const mysqlSpan = children.find(s => getSpanOp(s) === 'db');
  assertExists(mysqlSpan, `expected a db child span, got ops: ${children.map(s => getSpanOp(s)).join(', ')}`);
  assertEquals(mysqlSpan.name, 'SELECT');
  assertEquals(mysqlSpan.attributes['db.system.name']?.value, 'mysql');
  assertEquals(mysqlSpan.attributes['db.query.text']?.value, 'SELECT ? AS solution');
  assertEquals(mysqlSpan.attributes['db.namespace']?.value, 'mydb');
  assertEquals(mysqlSpan.attributes['db.user']?.value, 'root');
  assertEquals(mysqlSpan.attributes['server.address']?.value, '127.0.0.1');
  assertEquals(mysqlSpan.attributes['server.port']?.value, 3306);
  assertEquals(mysqlSpan.attributes['sentry.origin']?.value, 'auto.db.mysql2');
});
