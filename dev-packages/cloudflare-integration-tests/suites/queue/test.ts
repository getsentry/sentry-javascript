import { SENTRY_LINK_TYPE } from '@sentry/conventions/attributes';
import type { Envelope, SerializedStreamedSpan } from '@sentry/core';
import { expect, it } from 'vitest';
import { createRunner } from '../../runner';
import { getSpansFromEnvelope } from '../../spanUtils';

it('captures errors thrown by the queue handler with the correct mechanism', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .ignore('span')
    .expect((envelope: Envelope) => {
      expect(envelope[1][0]?.[0]?.type).toBe('event');
      expect(envelope[1][0]?.[1]).toMatchObject({
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

it('emits a queue.publish span on env.MY_QUEUE.send and a queue.process segment span on the consumer', async ({
  signal,
}) => {
  let publishSpan: SerializedStreamedSpan | undefined;
  let processSpan: SerializedStreamedSpan | undefined;
  const runner = createRunner(__dirname)
    .unordered()
    .expect((envelope: Envelope) => {
      // The producer trace carries a `queue.publish` child span.
      publishSpan = getSpansFromEnvelope(envelope).find(span => span.name === 'send MY_QUEUE');

      expect(publishSpan).toBeDefined();
      expect(publishSpan?.attributes).toEqual(
        expect.objectContaining({
          'sentry.op': { type: 'string', value: 'queue.publish' },
          'sentry.origin': { type: 'string', value: 'auto.faas.cloudflare.queue' },
          'messaging.system': { type: 'string', value: 'cloudflare' },
          'messaging.destination.name': { type: 'string', value: 'MY_QUEUE' },
          'messaging.operation.type': { type: 'string', value: 'send' },
          'messaging.operation.name': { type: 'string', value: 'send' },
        }),
      );
    })
    .expect((envelope: Envelope) => {
      // The consumer runs in its own trace, so its segment span arrives in its own envelope.
      const segmentSpan = getSpansFromEnvelope(envelope).find(span => span.is_segment);

      expect(segmentSpan?.name).toBe('process test-queue');
      expect(segmentSpan?.attributes).toEqual(
        expect.objectContaining({
          'sentry.op': { type: 'string', value: 'queue.process' },
          'sentry.origin': { type: 'string', value: 'auto.faas.cloudflare.queue' },
          'messaging.system': { type: 'string', value: 'cloudflare' },
          'messaging.destination.name': { type: 'string', value: 'test-queue' },
          'messaging.operation.type': { type: 'string', value: 'process' },
          'messaging.operation.name': { type: 'string', value: 'process' },
          'messaging.batch.message_count': { type: 'integer', value: 1 },
          'faas.trigger': { type: 'string', value: 'pubsub' },
          // The handler must not see the trace context the producer injected.
          'test.queue.message_bodies': { type: 'string', value: '[{"payload":"hello"}]' },
        }),
      );
      processSpan = segmentSpan;
    })
    .start(signal);

  await runner.makeRequest('post', '/enqueue/ok');
  await runner.completed();

  expect(processSpan?.trace_id).not.toBe(publishSpan?.trace_id);
  expect(processSpan?.links).toEqual([
    {
      trace_id: publishSpan?.trace_id,
      span_id: publishSpan?.span_id,
      sampled: true,
      attributes: { [SENTRY_LINK_TYPE]: { type: 'string', value: 'message_origin' } },
    },
  ]);
});

it('emits a queue.publish span with batch attributes on env.MY_QUEUE.sendBatch', async ({ signal }) => {
  let publishSpan: SerializedStreamedSpan | undefined;
  let processSpan: SerializedStreamedSpan | undefined;
  const runner = createRunner(__dirname)
    .unordered()
    .expect((envelope: Envelope) => {
      publishSpan = getSpansFromEnvelope(envelope).find(span => span.name === 'send MY_QUEUE');

      expect(publishSpan).toBeDefined();
      expect(publishSpan?.attributes).toEqual(
        expect.objectContaining({
          'sentry.op': { type: 'string', value: 'queue.publish' },
          'sentry.origin': { type: 'string', value: 'auto.faas.cloudflare.queue' },
          'messaging.system': { type: 'string', value: 'cloudflare' },
          'messaging.destination.name': { type: 'string', value: 'MY_QUEUE' },
          'messaging.operation.type': { type: 'string', value: 'send' },
          'messaging.operation.name': { type: 'string', value: 'send' },
          'messaging.batch.message_count': { type: 'integer', value: 3 },
        }),
      );
    })
    .expect((envelope: Envelope) => {
      const segmentSpan = getSpansFromEnvelope(envelope).find(span => span.is_segment);

      expect(segmentSpan?.name).toBe('process test-queue');
      expect(segmentSpan?.attributes['messaging.batch.message_count']).toEqual({ type: 'integer', value: 3 });
      expect(segmentSpan?.attributes['test.queue.message_bodies']).toEqual({
        type: 'string',
        value: '[{"payload":"one"},{"payload":"two"},{"payload":"three"}]',
      });
      processSpan = segmentSpan;
    })
    .start(signal);

  await runner.makeRequest('post', '/enqueue/batch');
  await runner.completed();

  // All three messages come from one publish span, so the consumer links it once.
  expect(processSpan?.links).toEqual([
    {
      trace_id: publishSpan?.trace_id,
      span_id: publishSpan?.span_id,
      sampled: true,
      attributes: { [SENTRY_LINK_TYPE]: { type: 'string', value: 'message_origin' } },
    },
  ]);
});

it('calls non-instrumented Queue methods like metrics() on the underlying binding', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect((envelope: Envelope) => {
      const segmentSpan = getSpansFromEnvelope(envelope).find(span => span.is_segment);

      expect(segmentSpan?.name).toBe('GET');
      expect(segmentSpan?.attributes['url.path']).toEqual({ type: 'string', value: '/metrics' });
      expect(segmentSpan?.status).toBe('ok');
    })
    .start(signal);

  const metrics = await runner.makeRequest('get', '/metrics');
  expect(metrics).toMatchObject({ backlogCount: expect.any(Number), backlogBytes: expect.any(Number) });
  await runner.completed();
});
