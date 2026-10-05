// <reference lib="deno.ns" />

import { tracingChannel } from 'node:diagnostics_channel';
import type { DenoClient } from '@sentry/deno';
import { flush, init, startSpan } from '@sentry/deno';
import { assert } from 'https://deno.land/std@0.212.0/assert/assert.ts';
import { assertExists } from 'https://deno.land/std@0.212.0/assert/assert_exists.ts';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';
import { getSpanOp, resetGlobals, spanSink, withTimeout } from '../../src/index.ts';

Deno.test('amqplib instrumentation: included in default integrations (Deno 2.8.0+)', () => {
  resetGlobals();
  const client = init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
  }) as DenoClient;
  const names = client.getOptions().integrations.map(i => i.name);
  assert(names.includes('Amqplib'), `Amqplib should be in defaults, got ${names.join(', ')}`);
});

Deno.test('amqplib instrumentation: orchestrion:amqplib:publish channel produces a nested queue.publish span', async () => {
  resetGlobals();
  const sink = spanSink();
  init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    transport: sink.transport,
  });

  const channel = tracingChannel('orchestrion:amqplib:publish');

  // `publish(exchange, routingKey, content, options)`; `self.connection` carries
  // the server product used for `messaging.system`.
  const ctx = {
    self: { connection: { serverProperties: { product: 'RabbitMQ' } } },
    arguments: ['my-exchange', 'my.routing.key', new Uint8Array(), { messageId: 'msg-1' }],
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

  const publishSpan = children.find(s => getSpanOp(s) === 'queue.publish');
  assertExists(
    publishSpan,
    `expected a queue.publish child span, got ops: ${children.map(s => getSpanOp(s)).join(', ')}`,
  );
  assertEquals(publishSpan.name, 'send my-exchange');
  assertEquals(publishSpan.attributes['messaging.destination.name']?.value, 'my-exchange');
  assertEquals(publishSpan.attributes['messaging.system']?.value, 'rabbitmq');
  assertEquals(publishSpan.attributes['sentry.origin']?.value, 'auto.amqplib.publisher');
});
