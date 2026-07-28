// <reference lib="deno.ns" />

import { tracingChannel } from 'node:diagnostics_channel';
import type { DenoClient } from '@sentry/deno';
import { init, startSpan } from '@sentry/deno';
import { assert } from 'https://deno.land/std@0.212.0/assert/assert.ts';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';
import { assertExists } from 'https://deno.land/std@0.212.0/assert/assert_exists.ts';
import { resetGlobals, transactionSink, withTimeout } from '../../src/index.ts';

// Drives one graphql parse channel and asserts the resulting nested span. The
// composed integration subscribes to both the orchestrion channel (graphql
// v14–16) and graphql v17's native `graphql:parse` channel; both emit the same
// `graphql.parse` span, so exercising each channel proves that half is wired.
async function assertParseSpan(channelName: string): Promise<void> {
  resetGlobals();
  const sink = transactionSink();
  init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    beforeSendTransaction: sink.beforeSendTransaction,
  });

  const channel = tracingChannel(channelName);
  const ctx = { arguments: [] };

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

  const parseSpan = parent.spans?.find(s => s.description === 'graphql.parse');
  assertExists(parseSpan, `expected a graphql.parse span, got: ${parent.spans?.map(s => s.description).join(', ')}`);
  assertEquals(parseSpan!.op, 'graphql');
  assertEquals(parseSpan!.data?.['sentry.origin'], 'auto.graphql.diagnostic_channel');
}

Deno.test('graphql instrumentation: included in default integrations (Deno 2.8.0+)', () => {
  resetGlobals();
  const client = init({ dsn: 'https://username@domain/123' }) as DenoClient;
  const names = client.getOptions().integrations.map(i => i.name);
  assert(names.includes('Graphql'), `Graphql should be in defaults, got ${names.join(', ')}`);
});

Deno.test('graphql instrumentation: orchestrion:graphql:parse channel produces a nested span (v14–16)', async () => {
  await assertParseSpan('orchestrion:graphql:parse');
});

Deno.test('graphql instrumentation: native graphql:parse channel produces a nested span (v17)', async () => {
  await assertParseSpan('graphql:parse');
});
