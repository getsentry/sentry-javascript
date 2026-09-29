import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';
import { getSpanOp } from '../../../spanUtils';

it('propagates the trace over a Durable Object RPC call without configuring the binding', async ({ signal }) => {
  const runner = createRunner(__dirname).start(signal);

  // The worker and the Durable Object stream from separate isolates, so the two segment spans of
  // the trace arrive in separate envelopes.
  const spansPromise = runner.collectStreamedSpans(
    spansOfTrace => spansOfTrace.filter(span => span.is_segment).length === 2,
  );

  // `argumentCount` proves the receiver stripped the metadata argument again.
  const response = await runner.makeRequest<{ count: number; argumentCount: number }>('get', '/increment');
  expect(response).toEqual({ count: 1, argumentCount: 1 });

  const segmentSpans = (await spansPromise).filter(span => span.is_segment);
  const workerSpan = segmentSpans.find(span => getSpanOp(span) === 'http.server');
  const durableObjectSpan = segmentSpans.find(span => getSpanOp(span) === 'rpc');

  expect(workerSpan).toBeDefined();
  expect(durableObjectSpan?.parent_span_id).toBe(workerSpan?.span_id);
});
