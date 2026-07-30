// <reference lib="deno.ns" />

import { tracingChannel } from 'node:diagnostics_channel';
import type { DenoClient } from '@sentry/deno';
import { init, startSpan } from '@sentry/deno';
import { assert } from 'https://deno.land/std@0.212.0/assert/assert.ts';
import { assertExists } from 'https://deno.land/std@0.212.0/assert/assert_exists.ts';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';
import { resetGlobals, transactionSink, withTimeout } from '../../src/index.ts';

Deno.test('mongoose instrumentation: included in default integrations (Deno 2.8.0+)', () => {
  resetGlobals();
  const client = init({ traceLifecycle: 'static', dsn: 'https://username@domain/123' }) as DenoClient;
  const names = client.getOptions().integrations.map(i => i.name);
  assert(names.includes('Mongoose'), `Mongoose should be in defaults, got ${names.join(', ')}`);
});

Deno.test('mongoose instrumentation: orchestrion:mongoose:model_save channel produces a nested db span', async () => {
  resetGlobals();
  const sink = transactionSink();
  init({
    traceLifecycle: 'static',
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    beforeSendTransaction: sink.beforeSendTransaction,
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

  const parent = await withTimeout(
    sink.waitFor(t => t.transaction === 'parent'),
    5000,
    "'parent' transaction",
  );

  const mongooseSpan = parent.spans?.find(s => s.op === 'db');
  assertExists(mongooseSpan, `expected a db child span, got ops: ${parent.spans?.map(s => s.op).join(', ')}`);
  assertEquals(mongooseSpan!.description, 'mongoose.BlogPost.save');
  assertEquals(mongooseSpan!.data?.['db.system'], 'mongoose');
  assertEquals(mongooseSpan!.data?.['db.name'], 'mydb');
  assertEquals(mongooseSpan!.data?.['db.mongodb.collection'], 'blogposts');
  assertEquals(mongooseSpan!.data?.['db.operation'], 'save');
  assertEquals(mongooseSpan!.data?.['db.user'], 'root');
  assertEquals(mongooseSpan!.data?.['net.peer.name'], '127.0.0.1');
  assertEquals(mongooseSpan!.data?.['net.peer.port'], 27017);
  assertEquals(mongooseSpan!.data?.['sentry.origin'], 'auto.db.mongoose');
});
