import type { Envelope } from '@sentry/core';
import { expect, it } from 'vitest';
import { createRunner } from '../../runner';

function envelopeItemType(envelope: Envelope): string | undefined {
  return envelope[1][0]?.[0]?.type as string | undefined;
}

function envelopeItem(envelope: Envelope): Record<string, unknown> {
  return envelope[1][0]![1] as Record<string, unknown>;
}

function findPublishSpan(envelope: Envelope): Record<string, unknown> | undefined {
  if (envelopeItemType(envelope) !== 'transaction') return undefined;
  const tx = envelopeItem(envelope);
  const spans = (tx.spans as Array<Record<string, unknown>>) || [];
  return spans.find(s => (s.op as string) === 'queue.publish');
}

function isConsumerTransaction(envelope: Envelope): boolean {
  if (envelopeItemType(envelope) !== 'transaction') return false;
  const tx = envelopeItem(envelope);
  return tx.transaction === 'process test-queue';
}

it('captures errors thrown by the queue handler with the correct mechanism', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .ignore('transaction')
    .expect((envelope: Envelope) => {
      expect(envelopeItemType(envelope)).toBe('event');
      const event = envelopeItem(envelope);
      expect(event).toMatchObject({
        level: 'error',
        exception: {
          values: [
            {
              type: 'Error',
              value: 'Boom from queue handler',
              mechanism: { type: 'auto.faas.cloudflare.queue', handled: false },
            },
          ],
        },
      });
    })
    .start(signal);

  await runner.makeRequest('post', '/enqueue/error');
  await runner.completed();
});

it('emits a queue.publish span on env.MY_QUEUE.send and a queue.process transaction on the consumer', async ({
  signal,
}) => {
  const runner = createRunner(__dirname)
    .unordered()
    .expect((envelope: Envelope) => {
      // Producer transaction must contain a queue.publish child span
      const publishSpan = findPublishSpan(envelope);
      expect(publishSpan).toBeDefined();
      expect(publishSpan).toMatchObject({
        op: 'queue.publish',
        description: 'send MY_QUEUE',
        data: expect.objectContaining({
          'messaging.system': 'cloudflare',
          'messaging.destination.name': 'MY_QUEUE',
          'messaging.operation.type': 'send',
          'messaging.operation.name': 'send',
          'sentry.origin': 'auto.faas.cloudflare.queue',
        }),
      });
    })
    .expect((envelope: Envelope) => {
      expect(isConsumerTransaction(envelope)).toBe(true);
      const tx = envelopeItem(envelope);
      const trace = (tx.contexts as Record<string, Record<string, unknown>>).trace as Record<string, unknown>;
      expect(trace).toMatchObject({
        op: 'queue.process',
        origin: 'auto.faas.cloudflare.queue',
        data: expect.objectContaining({
          'messaging.system': 'cloudflare',
          'messaging.destination.name': 'test-queue',
          'messaging.operation.type': 'process',
          'messaging.operation.name': 'process',
          'messaging.batch.message_count': 1,
          'faas.trigger': 'pubsub',
        }),
      });
    })
    .start(signal);

  await runner.makeRequest('post', '/enqueue/ok');
  await runner.completed();
});

it('connects producer and consumer via a span link when enableQueueTracePropagation is on', async ({ signal }) => {
  let producerTraceId: string | undefined;
  let producerSpanId: string | undefined;

  const runner = createRunner(__dirname)
    .unordered()
    .expect((envelope: Envelope) => {
      // Producer transaction — capture publish span ids for the link assertion
      const publishSpan = findPublishSpan(envelope);
      expect(publishSpan).toBeDefined();
      producerTraceId = publishSpan!.trace_id as string;
      producerSpanId = publishSpan!.span_id as string;
    })
    .expect((envelope: Envelope) => {
      // Consumer transaction must carry a link to the producer's publish span
      // AND a `sentry.previous_trace` attribute that Sentry's trace UI reads.
      expect(isConsumerTransaction(envelope)).toBe(true);
      const tx = envelopeItem(envelope);
      const trace = (tx.contexts as Record<string, Record<string, unknown>>).trace as Record<string, unknown>;

      const links = trace.links as
        | Array<{ trace_id: string; span_id: string; attributes?: Record<string, unknown> }>
        | undefined;
      expect(links).toBeDefined();
      expect(links).toHaveLength(1);
      expect(links![0]!.trace_id).toBe(producerTraceId);
      expect(links![0]!.span_id).toBe(producerSpanId);
      expect(links![0]!.attributes?.['sentry.link.type']).toBe('previous_trace');

      const data = trace.data as Record<string, unknown> | undefined;
      expect(data?.['sentry.previous_trace']).toBe(`${producerTraceId}-${producerSpanId}-1`);
    })
    .start(signal);

  await runner.makeRequest('post', '/enqueue/ok');
  await runner.completed();
});

it('emits a queue.publish span with batch attributes on env.MY_QUEUE.sendBatch', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .unordered()
    .expect((envelope: Envelope) => {
      const publishSpan = findPublishSpan(envelope);
      expect(publishSpan).toBeDefined();
      expect(publishSpan).toMatchObject({
        op: 'queue.publish',
        description: 'send MY_QUEUE',
        data: expect.objectContaining({
          'messaging.system': 'cloudflare',
          'messaging.destination.name': 'MY_QUEUE',
          'messaging.operation.type': 'send',
          'messaging.operation.name': 'send',
          'messaging.batch.message_count': 3,
          'sentry.origin': 'auto.faas.cloudflare.queue',
        }),
      });
    })
    .expect((envelope: Envelope) => {
      expect(isConsumerTransaction(envelope)).toBe(true);
      const tx = envelopeItem(envelope);
      const trace = (tx.contexts as Record<string, Record<string, unknown>>).trace as Record<string, unknown>;
      expect(trace).toMatchObject({
        data: expect.objectContaining({
          'messaging.batch.message_count': 3,
        }),
      });
    })
    .start(signal);

  await runner.makeRequest('post', '/enqueue/batch');
  await runner.completed();
});
