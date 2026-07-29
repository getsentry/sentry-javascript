// <reference lib="deno.ns" />

import { tracingChannel } from 'node:diagnostics_channel';
import type { DenoClient } from '@sentry/deno';
import { init, startSpan } from '@sentry/deno';
import { assert } from 'https://deno.land/std@0.212.0/assert/assert.ts';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';
import { assertExists } from 'https://deno.land/std@0.212.0/assert/assert_exists.ts';
import { resetGlobals, transactionSink, withTimeout } from '../../src/index.ts';

Deno.test('mongodb instrumentation: included in default integrations (Deno 2.8.0+)', () => {
  resetGlobals();
  const client = init({ traceLifecycle: 'static', dsn: 'https://username@domain/123' }) as DenoClient;
  const names = client.getOptions().integrations.map(i => i.name);
  assert(names.includes('Mongo'), `Mongo should be in defaults, got ${names.join(', ')}`);
});

Deno.test('mongodb instrumentation: orchestrion:mongodb:command channel produces a nested db span', async () => {
  resetGlobals();
  const sink = transactionSink();
  init({
    traceLifecycle: 'static',
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    beforeSendTransaction: sink.beforeSendTransaction,
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

  const parent = await withTimeout(
    sink.waitFor(t => t.transaction === 'parent'),
    5000,
    "'parent' transaction",
  );

  const mongoSpan = parent.spans?.find(s => s.op === 'db');
  assertExists(mongoSpan, `expected a db child span, got ops: ${parent.spans?.map(s => s.op).join(', ')}`);
  assertEquals(mongoSpan!.description, '{"find":"?","filter":{"name":"?"}}');
  assertEquals(mongoSpan!.data?.['db.system'], 'mongodb');
  assertEquals(mongoSpan!.data?.['db.statement'], '{"find":"?","filter":{"name":"?"}}');
  assertEquals(mongoSpan!.data?.['db.name'], 'mydb');
  assertEquals(mongoSpan!.data?.['db.mongodb.collection'], 'users');
  assertEquals(mongoSpan!.data?.['db.operation'], 'find');
  assertEquals(mongoSpan!.data?.['net.peer.name'], '127.0.0.1');
  assertEquals(mongoSpan!.data?.['net.peer.port'], 27017);
  assertEquals(mongoSpan!.data?.['sentry.origin'], 'auto.db.orchestrion.mongo');
});
