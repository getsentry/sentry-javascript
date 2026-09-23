import { expect, it } from 'vitest';
import type { SerializedStreamedSpan } from '@sentry/core';
import { createRunner } from '../../../../runner';
import { getSpanOp, getSpansFromEnvelope } from '../../../../spanUtils';

it('propagates trace from worker to durable object', async ({ signal }) => {
  let workerSpan: SerializedStreamedSpan | undefined;
  let doSpan: SerializedStreamedSpan | undefined;

  const runner = createRunner(__dirname)
    .expect(envelope => {
      const segmentSpan = getSpansFromEnvelope(envelope).find(span => span.is_segment);

      expect(getSpanOp(segmentSpan!)).toBe('http.server');
      expect(segmentSpan?.attributes['sentry.origin']).toEqual({ type: 'string', value: 'auto.http.cloudflare' });
      // `/hello` is a raw URL, so the streamed segment name keeps the method only.
      expect(segmentSpan?.attributes['url.path']).toEqual({ type: 'string', value: '/hello' });
      doSpan = segmentSpan;
    })
    .expect(envelope => {
      const segmentSpan = getSpansFromEnvelope(envelope).find(span => span.is_segment);

      expect(getSpanOp(segmentSpan!)).toBe('http.server');
      expect(segmentSpan?.attributes['sentry.origin']).toEqual({ type: 'string', value: 'auto.http.cloudflare' });
      expect(segmentSpan?.name).toBe('GET /');
      workerSpan = segmentSpan;
    })
    .unordered()
    .start(signal);
  await runner.makeRequest('get', '/');
  await runner.completed();

  expect(workerSpan?.trace_id).toBeDefined();
  expect(doSpan?.trace_id).toBe(workerSpan?.trace_id);
  expect(doSpan?.parent_span_id).toBe(workerSpan?.span_id);
});

it('propagates trace from queue handler to durable object', async ({ signal }) => {
  let queueSpan: SerializedStreamedSpan | undefined;
  let doSpan: SerializedStreamedSpan | undefined;

  const runner = createRunner(__dirname)
    .expect(envelope => {
      const segmentSpan = getSpansFromEnvelope(envelope).find(span => span.is_segment);

      expect(getSpanOp(segmentSpan!)).toBe('http.server');
      expect(segmentSpan?.attributes['sentry.origin']).toEqual({ type: 'string', value: 'auto.http.cloudflare' });
      expect(segmentSpan?.attributes['url.path']).toEqual({ type: 'string', value: '/hello' });
      doSpan = segmentSpan;
    })
    .expect(envelope => {
      const segmentSpan = getSpansFromEnvelope(envelope).find(span => span.is_segment);

      expect(segmentSpan?.name).toBe('process my-queue');
      expect(getSpanOp(segmentSpan!)).toBe('queue.process');
      expect(segmentSpan?.attributes['sentry.origin']).toEqual({
        type: 'string',
        value: 'auto.faas.cloudflare.queue',
      });
      queueSpan = segmentSpan;
    })
    // Also expect the fetch span from the /queue/send request
    .expect(envelope => {
      const segmentSpan = getSpansFromEnvelope(envelope).find(span => span.is_segment);

      expect(getSpanOp(segmentSpan!)).toBe('http.server');
      expect(segmentSpan?.attributes['sentry.origin']).toEqual({ type: 'string', value: 'auto.http.cloudflare' });
      expect(segmentSpan?.attributes['url.path']).toEqual({ type: 'string', value: '/queue/send' });
    })
    .unordered()
    .start(signal);
  // The fetch handler sends a message to the queue, which triggers the queue consumer
  await runner.makeRequest('get', '/queue/send');
  await runner.completed();

  expect(queueSpan?.trace_id).toBeDefined();
  expect(doSpan?.trace_id).toBe(queueSpan?.trace_id);
  expect(doSpan?.parent_span_id).toBe(queueSpan?.span_id);
});

it('propagates trace from scheduled handler to durable object', async ({ signal }) => {
  let scheduledSpan: SerializedStreamedSpan | undefined;
  let doSpan: SerializedStreamedSpan | undefined;

  const runner = createRunner(__dirname)
    .withWranglerArgs('--test-scheduled')
    .expect(envelope => {
      const segmentSpan = getSpansFromEnvelope(envelope).find(span => span.is_segment);

      expect(getSpanOp(segmentSpan!)).toBe('http.server');
      expect(segmentSpan?.attributes['sentry.origin']).toEqual({ type: 'string', value: 'auto.http.cloudflare' });
      expect(segmentSpan?.attributes['url.path']).toEqual({ type: 'string', value: '/hello' });
      doSpan = segmentSpan;
    })
    .expect(envelope => {
      const segmentSpan = getSpansFromEnvelope(envelope).find(span => span.is_segment);

      expect(getSpanOp(segmentSpan!)).toBe('function');
      expect(segmentSpan?.attributes['sentry.origin']).toEqual({
        type: 'string',
        value: 'auto.faas.cloudflare.scheduled',
      });
      scheduledSpan = segmentSpan;
    })
    .unordered()
    .start(signal);
  await runner.makeRequest('get', '/__scheduled?cron=*+*+*+*+*');
  await runner.completed();

  expect(scheduledSpan?.trace_id).toBeDefined();
  expect(doSpan?.trace_id).toBe(scheduledSpan?.trace_id);
  expect(doSpan?.parent_span_id).toBe(scheduledSpan?.span_id);
});
