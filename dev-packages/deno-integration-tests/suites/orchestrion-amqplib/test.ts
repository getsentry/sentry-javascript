// <reference lib="deno.ns" />

import { tracingChannel } from 'node:diagnostics_channel';
import type { TransactionEvent } from '@sentry/core';
import type { DenoClient } from '@sentry/deno';
import { getCurrentScope, getGlobalScope, getIsolationScope, init, startSpan } from '@sentry/deno';
import { assert } from 'https://deno.land/std@0.212.0/assert/assert.ts';
import { assertExists } from 'https://deno.land/std@0.212.0/assert/assert_exists.ts';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';

function resetGlobals(): void {
  getCurrentScope().clear();
  getCurrentScope().setClient(undefined);
  getIsolationScope().clear();
  getGlobalScope().clear();
}

/** See deno-redis.test.ts — same sink shape, deduped for clarity. */
function transactionSink(): {
  beforeSendTransaction: (event: TransactionEvent) => null;
  waitFor: (predicate: (event: TransactionEvent) => boolean) => Promise<TransactionEvent>;
} {
  const transactions: TransactionEvent[] = [];
  const waiters: { predicate: (e: TransactionEvent) => boolean; resolve: (e: TransactionEvent) => void }[] = [];
  return {
    beforeSendTransaction(event) {
      transactions.push(event);
      for (let i = waiters.length - 1; i >= 0; i--) {
        const w = waiters[i]!;
        if (w.predicate(event)) {
          waiters.splice(i, 1);
          w.resolve(event);
        }
      }
      return null;
    },
    waitFor(predicate) {
      const already = transactions.find(predicate);
      if (already) return Promise.resolve(already);
      return new Promise<TransactionEvent>(resolve => {
        waiters.push({ predicate, resolve });
      });
    },
  };
}

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out waiting for ${what} after ${ms}ms`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

Deno.test('amqplib instrumentation: included in default integrations (Deno 2.8.0+)', () => {
  resetGlobals();
  const client = init({ dsn: 'https://username@domain/123' }) as DenoClient;
  const names = client.getOptions().integrations.map(i => i.name);
  assert(names.includes('Amqplib'), `Amqplib should be in defaults, got ${names.join(', ')}`);
});

// Exercises the SDK path end-to-end: `init()` installs the AsyncLocalStorage
// context strategy and wires the default `amqplibChannelIntegration` (which
// subscribes to the channel), and we drive the `orchestrion:amqplib:publish`
// channel manually — the same events the orchestrion transform publishes around
// `Channel.prototype.publish` — so no live broker is needed. Asserting a nested
// producer `message` span proves the subscriber, the emitted attributes, AND the
// context-strategy wiring all work.
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
