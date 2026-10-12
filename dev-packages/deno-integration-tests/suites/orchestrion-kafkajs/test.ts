// <reference lib="deno.ns" />

import { tracingChannel } from 'node:diagnostics_channel';
import type { DenoClient } from '@sentry/deno';
import { flush, init, startSpan } from '@sentry/deno';
import { assert } from 'https://deno.land/std@0.212.0/assert/assert.ts';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';
import { assertExists } from 'https://deno.land/std@0.212.0/assert/assert_exists.ts';
import { getSpanOp, resetGlobals, spanSink, withTimeout } from '../../src/index.ts';

Deno.test('kafkajs instrumentation: included in default integrations (Deno 2.8.0+)', () => {
  resetGlobals();
  const client = init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
  }) as DenoClient;
  const names = client.getOptions().integrations.map(i => i.name);
  assert(names.includes('Kafka'), `Kafka should be in defaults, got ${names.join(', ')}`);
});

Deno.test('kafkajs instrumentation: orchestrion:kafkajs:send_batch channel produces a nested producer span', async () => {
  resetGlobals();
  const sink = spanSink();
  init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    transport: sink.transport,
  });

  const channel = tracingChannel('orchestrion:kafkajs:send_batch');

  // `arguments[0]` is the `{ topicMessages }` batch; a producer span is opened per message.
  const ctx = { arguments: [{ topicMessages: [{ topic: 'my-topic', messages: [{ value: 'hi' }] }] }] };

  startSpan({ name: 'parent', op: 'test' }, () => {
    channel.start.publish(ctx);
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

  const kafkaSpan = children.find(s => getSpanOp(s) === 'queue.publish');
  assertExists(
    kafkaSpan,
    `expected a queue.publish child span, got ops: ${children.map(s => getSpanOp(s)).join(', ')}`,
  );
  assertEquals(kafkaSpan.name, 'send my-topic');
  assertEquals(kafkaSpan.attributes['messaging.system']?.value, 'kafka');
  assertEquals(kafkaSpan.attributes['messaging.destination.name']?.value, 'my-topic');
  assertEquals(kafkaSpan.attributes['sentry.origin']?.value, 'auto.kafkajs.producer');
});
