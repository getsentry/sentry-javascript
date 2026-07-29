// <reference lib="deno.ns" />

import { tracingChannel } from 'node:diagnostics_channel';
import type { DenoClient } from '@sentry/deno';
import { init, startSpan } from '@sentry/deno';
import { assert } from 'https://deno.land/std@0.212.0/assert/assert.ts';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';
import { assertExists } from 'https://deno.land/std@0.212.0/assert/assert_exists.ts';
import { resetGlobals, transactionSink, withTimeout } from '../../src/index.ts';

Deno.test('kafkajs instrumentation: included in default integrations (Deno 2.8.0+)', () => {
  resetGlobals();
  const client = init({ traceLifecycle: 'static', dsn: 'https://username@domain/123' }) as DenoClient;
  const names = client.getOptions().integrations.map(i => i.name);
  assert(names.includes('Kafka'), `Kafka should be in defaults, got ${names.join(', ')}`);
});

Deno.test('kafkajs instrumentation: orchestrion:kafkajs:send_batch channel produces a nested producer span', async () => {
  resetGlobals();
  const sink = transactionSink();
  init({
    traceLifecycle: 'static',
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    beforeSendTransaction: sink.beforeSendTransaction,
  });

  const channel = tracingChannel('orchestrion:kafkajs:send_batch');

  // `arguments[0]` is the `{ topicMessages }` batch; a producer span is opened per message.
  const ctx = { arguments: [{ topicMessages: [{ topic: 'my-topic', messages: [{ value: 'hi' }] }] }] };

  startSpan({ name: 'parent', op: 'test' }, () => {
    channel.start.publish(ctx);
    channel.asyncEnd.publish(ctx);
  });

  const parent = await withTimeout(
    sink.waitFor(t => t.transaction === 'parent'),
    5000,
    "'parent' transaction",
  );

  const kafkaSpan = parent.spans?.find(s => s.op === 'message');
  assertExists(kafkaSpan, `expected a message child span, got ops: ${parent.spans?.map(s => s.op).join(', ')}`);
  assertEquals(kafkaSpan!.description, 'send my-topic');
  assertEquals(kafkaSpan!.data?.['messaging.system'], 'kafka');
  assertEquals(kafkaSpan!.data?.['messaging.destination.name'], 'my-topic');
  assertEquals(kafkaSpan!.data?.['sentry.origin'], 'auto.kafkajs.orchestrion.producer');
});
