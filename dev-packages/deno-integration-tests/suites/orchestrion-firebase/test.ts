// <reference lib="deno.ns" />

import { tracingChannel } from 'node:diagnostics_channel';
import type { DenoClient } from '@sentry/deno';
import { init, startSpan } from '@sentry/deno';
import { assert } from 'https://deno.land/std@0.212.0/assert/assert.ts';
import { assertExists } from 'https://deno.land/std@0.212.0/assert/assert_exists.ts';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';
import { resetGlobals, transactionSink, withTimeout } from '../../src/index.ts';

Deno.test('firebase instrumentation: included in default integrations (Deno 2.8.0+)', () => {
  resetGlobals();
  const client = init({ dsn: 'https://username@domain/123' }) as DenoClient;
  const names = client.getOptions().integrations.map(i => i.name);
  assert(names.includes('Firebase'), `Firebase should be in defaults, got ${names.join(', ')}`);
});

Deno.test('firebase instrumentation: orchestrion @firebase/firestore:add-doc channel produces a nested db span', async () => {
  resetGlobals();
  const sink = transactionSink();
  init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    beforeSendTransaction: sink.beforeSendTransaction,
  });

  const channel = tracingChannel('orchestrion:@firebase/firestore:add-doc');

  // The subscriber reads these off the reference: `path` names the span/collection,
  // `firestore.app` supplies the namespace and project options, `toJSON().settings`
  // the server host (omitted here, so no server.address/port attributes).
  const reference = {
    path: 'users',
    type: 'collection',
    firestore: {
      app: { name: '[DEFAULT]', options: { projectId: 'demo-project', appId: 'demo-app' } },
      toJSON: () => ({ settings: {} }),
    },
  };
  const ctx: Record<string, unknown> = { arguments: [reference] };

  startSpan({ name: 'parent', op: 'test' }, () => {
    channel.start.runStores(ctx, () => undefined);
    channel.end.publish(ctx);
    ctx.result = {};
    channel.asyncStart.runStores(ctx, () => undefined);
    channel.asyncEnd.publish(ctx);
  });

  const parent = await withTimeout(
    sink.waitFor(t => t.transaction === 'parent'),
    5000,
    "'parent' transaction",
  );

  const fsSpan = parent.spans?.find(s => s.op === 'db.query');
  assertExists(fsSpan, `expected a db.query child span, got ops: ${parent.spans?.map(s => s.op).join(', ')}`);
  assertEquals(fsSpan!.description, 'addDoc users');
  assertEquals(fsSpan!.data?.['db.operation.name'], 'addDoc');
  assertEquals(fsSpan!.data?.['db.collection.name'], 'users');
  assertEquals(fsSpan!.data?.['db.namespace'], '[DEFAULT]');
  assertEquals(fsSpan!.data?.['db.system.name'], 'firebase.firestore');
  assertEquals(fsSpan!.data?.['firebase.firestore.options.projectId'], 'demo-project');
  assertEquals(fsSpan!.data?.['sentry.origin'], 'auto.firebase.orchestrion.firestore');
});
