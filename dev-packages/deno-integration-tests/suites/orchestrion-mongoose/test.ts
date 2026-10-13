// <reference lib="deno.ns" />

import { tracingChannel } from 'node:diagnostics_channel';
import type { DenoClient } from '@sentry/deno';
import { flush, init, startSpan } from '@sentry/deno';
import { assert } from 'https://deno.land/std@0.212.0/assert/assert.ts';
import { assertExists } from 'https://deno.land/std@0.212.0/assert/assert_exists.ts';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';
import { getSpanOp, resetGlobals, spanSink, withTimeout } from '../../src/index.ts';

Deno.test('mongoose instrumentation: included in default integrations (Deno 2.8.0+)', () => {
  resetGlobals();
  const client = init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
  }) as DenoClient;
  const names = client.getOptions().integrations.map(i => i.name);
  assert(names.includes('Mongoose'), `Mongoose should be in defaults, got ${names.join(', ')}`);
});

Deno.test('mongoose instrumentation: orchestrion:mongoose:model_save channel produces a nested db span', async () => {
  resetGlobals();
  const sink = spanSink();
  init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    transport: sink.transport,
  });

  const channel = tracingChannel('orchestrion:mongoose:model_save');

  // `self` is the mongoose document; its `constructor` carries the collection
  // (name + connection info) and the model name.
  const ctx = {
    self: {
      constructor: {
        collection: { name: 'blogposts', conn: { name: 'mydb', user: 'root', host: '127.0.0.1', port: 27017 } },
        modelName: 'BlogPost',
      },
    },
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

  const mongooseSpan = children.find(s => getSpanOp(s) === 'db');
  assertExists(mongooseSpan, `expected a db child span, got ops: ${children.map(s => getSpanOp(s)).join(', ')}`);
  assertEquals(mongooseSpan.name, 'save blogposts');
  assertEquals(mongooseSpan.attributes['db.system.name']?.value, 'mongodb');
  assertEquals(mongooseSpan.attributes['db.namespace']?.value, 'mydb');
  assertEquals(mongooseSpan.attributes['db.collection.name']?.value, 'blogposts');
  assertEquals(mongooseSpan.attributes['db.operation.name']?.value, 'save');
  assertEquals(mongooseSpan.attributes['db.user']?.value, 'root');
  assertEquals(mongooseSpan.attributes['server.address']?.value, '127.0.0.1');
  assertEquals(mongooseSpan.attributes['server.port']?.value, 27017);
  assertEquals(mongooseSpan.attributes['sentry.origin']?.value, 'auto.db.mongoose');
});
