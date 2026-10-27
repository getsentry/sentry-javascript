import { expect, it } from 'vitest';
import type { SerializedStreamedSpan } from '@sentry/core';
import { createRunner } from '../../../../runner';
import { getSpanOp, getSpansFromEnvelope } from '../../../../spanUtils';

it('propagates trace from worker to durable object via RPC method call', async ({ signal }) => {
  let workerSpan: SerializedStreamedSpan | undefined;
  let doSpan: SerializedStreamedSpan | undefined;

  const runner = createRunner(__dirname)
    .expect(envelope => {
      const segmentSpan = getSpansFromEnvelope(envelope).find(span => span.is_segment);

      expect(segmentSpan?.name).toBe('sayHello');
      expect(getSpanOp(segmentSpan!)).toBe('rpc');
      expect(segmentSpan?.attributes['sentry.origin']).toEqual({
        type: 'string',
        value: 'auto.faas.cloudflare.durable_object',
      });
      doSpan = segmentSpan;
    })
    .expect(envelope => {
      const segmentSpan = getSpansFromEnvelope(envelope).find(span => span.is_segment);

      expect(getSpanOp(segmentSpan!)).toBe('http.server');
      expect(segmentSpan?.attributes['sentry.origin']).toEqual({ type: 'string', value: 'auto.http.cloudflare' });
      // `/rpc/hello` is a raw URL, so the streamed segment name keeps the method only.
      expect(segmentSpan?.attributes['url.path']).toEqual({ type: 'string', value: '/rpc/hello' });
      workerSpan = segmentSpan;
    })
    .unordered()
    .start(signal);

  const response = await runner.makeRequest<string>('get', '/rpc/hello');
  expect(response).toBe('Hello, World!');

  await runner.completed();

  expect(workerSpan?.trace_id).toBeDefined();
  expect(doSpan?.trace_id).toBe(workerSpan?.trace_id);
  expect(doSpan?.parent_span_id).toBe(workerSpan?.span_id);
});

it('propagates trace for RPC method with multiple arguments', async ({ signal }) => {
  let workerSpan: SerializedStreamedSpan | undefined;
  let doSpan: SerializedStreamedSpan | undefined;

  const runner = createRunner(__dirname)
    .expect(envelope => {
      const segmentSpan = getSpansFromEnvelope(envelope).find(span => span.is_segment);

      expect(segmentSpan?.name).toBe('multiply');
      expect(getSpanOp(segmentSpan!)).toBe('rpc');
      doSpan = segmentSpan;
    })
    .expect(envelope => {
      const segmentSpan = getSpansFromEnvelope(envelope).find(span => span.is_segment);

      expect(getSpanOp(segmentSpan!)).toBe('http.server');
      expect(segmentSpan?.attributes['url.path']).toEqual({ type: 'string', value: '/rpc/multiply' });
      workerSpan = segmentSpan;
    })
    .unordered()
    .start(signal);

  const response = await runner.makeRequest<string>('get', '/rpc/multiply');
  expect(response).toBe('42');

  await runner.completed();

  expect(workerSpan?.trace_id).toBeDefined();
  expect(doSpan?.trace_id).toBe(workerSpan?.trace_id);
  expect(doSpan?.parent_span_id).toBe(workerSpan?.span_id);
});
