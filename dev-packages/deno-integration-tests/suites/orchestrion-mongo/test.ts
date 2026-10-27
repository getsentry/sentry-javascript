// <reference lib="deno.ns" />

import { tracingChannel } from 'node:diagnostics_channel';
import type { DenoClient } from '@sentry/deno';
import { flush, init, startSpan } from '@sentry/deno';
import { assert } from 'https://deno.land/std@0.212.0/assert/assert.ts';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';
import { assertExists } from 'https://deno.land/std@0.212.0/assert/assert_exists.ts';
import { getSpanOp, resetGlobals, spanSink, withTimeout } from '../../src/index.ts';

Deno.test('mongodb instrumentation: included in default integrations (Deno 2.8.0+)', () => {
  resetGlobals();
  const client = init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
  }) as DenoClient;
  const names = client.getOptions().integrations.map(i => i.name);
  assert(names.includes('Mongo'), `Mongo should be in defaults, got ${names.join(', ')}`);
});

Deno.test('mongodb instrumentation: orchestrion:mongodb:command channel produces a nested db span', async () => {
  resetGlobals();
  const sink = spanSink();
  init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    transport: sink.transport,
  });

  const channel = tracingChannel('orchestrion:mongodb:command');

  // `arguments[0]` is the namespace, `arguments[1]` the command doc (its first
  // key is the operation); `self.address` is the connection's host:port.
  const ctx = {
    self: { address: '127.0.0.1:27017' },
    arguments: [
      { db: 'mydb', collection: 'users' },
      { find: 'users', filter: { name: 'test' } },
    ],
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

  const mongoSpan = children.find(s => getSpanOp(s) === 'db');
  assertExists(mongoSpan, `expected a db child span, got ops: ${children.map(s => getSpanOp(s)).join(', ')}`);
  assertEquals(mongoSpan.name, 'find users');
  assertEquals(mongoSpan.attributes['db.system.name']?.value, 'mongodb');
  assertEquals(mongoSpan.attributes['db.query.text']?.value, '{"find":"?","filter":{"name":"?"}}');
  assertEquals(mongoSpan.attributes['db.namespace']?.value, 'mydb');
  assertEquals(mongoSpan.attributes['db.collection.name']?.value, 'users');
  assertEquals(mongoSpan.attributes['db.operation.name']?.value, 'find');
  assertEquals(mongoSpan.attributes['server.address']?.value, '127.0.0.1');
  assertEquals(mongoSpan.attributes['server.port']?.value, 27017);
  assertEquals(mongoSpan.attributes['sentry.origin']?.value, 'auto.db.mongo');
});
