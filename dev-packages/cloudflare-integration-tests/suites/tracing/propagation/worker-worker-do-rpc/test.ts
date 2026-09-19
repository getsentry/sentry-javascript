import { expect, it } from 'vitest';
import type { SerializedStreamedSpan } from '@sentry/core';
import { createRunner } from '../../../../runner';
import { getSpanOp, getSpansFromEnvelope } from '../../../../spanUtils';

it('propagates trace from worker to worker to durable object (3 levels deep)', async ({ signal }) => {
  let mainWorkerSpan: SerializedStreamedSpan | undefined;
  let subWorkerSpan: SerializedStreamedSpan | undefined;
  let doSpan: SerializedStreamedSpan | undefined;

  const runner = createRunner(__dirname)
    .expect(envelope => {
      const segmentSpan = getSpansFromEnvelope(envelope).find(span => span.is_segment);

      // Main worker HTTP server segment span
      expect(getSpanOp(segmentSpan!)).toBe('http.server');
      expect(segmentSpan?.attributes['sentry.origin']).toEqual({ type: 'string', value: 'auto.http.cloudflare' });
      // `/chain` is a raw URL, so the streamed segment name keeps the method only.
      expect(segmentSpan?.attributes['url.path']).toEqual({ type: 'string', value: '/chain' });
      mainWorkerSpan = segmentSpan;
    })
    .expect(envelope => {
      const segmentSpan = getSpansFromEnvelope(envelope).find(span => span.is_segment);

      // Sub-worker HTTP server segment span (from service binding fetch)
      expect(getSpanOp(segmentSpan!)).toBe('http.server');
      expect(segmentSpan?.attributes['sentry.origin']).toEqual({ type: 'string', value: 'auto.http.cloudflare' });
      expect(segmentSpan?.attributes['url.path']).toEqual({ type: 'string', value: '/call-do' });
      subWorkerSpan = segmentSpan;
    })
    .expect(envelope => {
      const segmentSpan = getSpansFromEnvelope(envelope).find(span => span.is_segment);

      // Durable Object RPC segment span
      expect(segmentSpan?.name).toBe('computeAnswer');
      expect(getSpanOp(segmentSpan!)).toBe('rpc');
      expect(segmentSpan?.attributes['sentry.origin']).toEqual({
        type: 'string',
        value: 'auto.faas.cloudflare.durable_object',
      });
      doSpan = segmentSpan;
    })
    .unordered()
    .start(signal);

  const response = await runner.makeRequest<string>('get', '/chain');
  expect(response).toBe('The answer is 42');

  await runner.completed();

  // All three segment spans should share the same trace_id
  expect(mainWorkerSpan?.trace_id).toBeDefined();
  expect(subWorkerSpan?.trace_id).toBe(mainWorkerSpan?.trace_id);
  expect(doSpan?.trace_id).toBe(subWorkerSpan?.trace_id);

  // Verify the parent-child relationships form a chain:
  // Main Worker -> Sub Worker -> DO
  expect(subWorkerSpan?.parent_span_id).toBe(mainWorkerSpan?.span_id);
  expect(doSpan?.parent_span_id).toBe(subWorkerSpan?.span_id);
});
