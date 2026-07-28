// <reference lib="deno.ns" />

import { tracingChannel } from 'node:diagnostics_channel';
import type { DenoClient } from '@sentry/deno';
import { init, startSpan } from '@sentry/deno';
import { assert } from 'https://deno.land/std@0.212.0/assert/assert.ts';
import { assertExists } from 'https://deno.land/std@0.212.0/assert/assert_exists.ts';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';
import { resetGlobals, transactionSink, withTimeout } from '../../src/index.ts';

Deno.test('amqplib instrumentation: included in default integrations (Deno 2.8.0+)', () => {
  resetGlobals();
  const client = init({ dsn: 'https://username@domain/123' }) as DenoClient;
  const names = client.getOptions().integrations.map(i => i.name);
  assert(names.includes('Amqplib'), `Amqplib should be in defaults, got ${names.join(', ')}`);
});

Deno.test('amqplib instrumentation: orchestrion:amqplib:publish channel produces a nested message span', async () => {
  resetGlobals();
  const sink = transactionSink();
  init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    beforeSendTransaction: sink.beforeSendTransaction,
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

  const parent = await withTimeout(
    sink.waitFor(t => t.transaction === 'parent'),
    5000,
    "'parent' transaction",
  );

  const publishSpan = parent.spans?.find(s => s.op === 'message');
  assertExists(publishSpan, `expected a message child span, got ops: ${parent.spans?.map(s => s.op).join(', ')}`);
  assertEquals(publishSpan!.description, 'publish my-exchange');
  assertEquals(publishSpan!.data?.['messaging.destination.name'], 'my-exchange');
  assertEquals(publishSpan!.data?.['messaging.system'], 'rabbitmq');
  assertEquals(publishSpan!.data?.['sentry.origin'], 'auto.amqplib.orchestrion.publisher');
});
