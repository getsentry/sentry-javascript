// <reference lib="deno.ns" />

import { tracingChannel } from 'node:diagnostics_channel';
import type { DenoClient } from '@sentry/deno';
import { flush, init, startSpan } from '@sentry/deno';
import { assert } from 'https://deno.land/std@0.212.0/assert/assert.ts';
import { assertExists } from 'https://deno.land/std@0.212.0/assert/assert_exists.ts';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';
import { getSpanOp, resetGlobals, spanSink, withTimeout } from '../../src/index.ts';

Deno.test('firebase instrumentation: included in default integrations (Deno 2.8.0+)', () => {
  resetGlobals();
  const client = init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
  }) as DenoClient;
  const names = client.getOptions().integrations.map(i => i.name);
  assert(names.includes('Firebase'), `Firebase should be in defaults, got ${names.join(', ')}`);
});

Deno.test('firebase instrumentation: orchestrion @firebase/firestore:add-doc channel produces a nested db span', async () => {
  resetGlobals();
  const sink = spanSink();
  init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    transport: sink.transport,
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

  const fsSpan = children.find(s => getSpanOp(s) === 'db.query');
  assertExists(fsSpan, `expected a db.query child span, got ops: ${children.map(s => getSpanOp(s)).join(', ')}`);
  assertEquals(fsSpan.name, 'addDoc users');
  assertEquals(fsSpan.attributes['db.operation.name']?.value, 'addDoc');
  assertEquals(fsSpan.attributes['db.collection.name']?.value, 'users');
  assertEquals(fsSpan.attributes['db.namespace']?.value, '[DEFAULT]');
  assertEquals(fsSpan.attributes['db.system.name']?.value, 'firebase.firestore');
  assertEquals(fsSpan.attributes['firebase.firestore.options.projectId']?.value, 'demo-project');
  assertEquals(fsSpan.attributes['sentry.origin']?.value, 'auto.firebase.firestore');
});
