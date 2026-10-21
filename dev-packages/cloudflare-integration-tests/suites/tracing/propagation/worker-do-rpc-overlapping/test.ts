import { expect, it } from 'vitest';
import { createRunner } from '../../../../runner';
import { getSpanOp } from '../../../../spanUtils';

it('propagates the worker trace into each of two overlapping Durable Object RPC calls', async ({ signal }) => {
  const runner = createRunner(__dirname).start(signal);

  // The worker and the Durable Object stream from separate isolates, and both RPC segments come from
  // the same Durable Object, so they can share an envelope.
  const spansPromise = runner.collectStreamedSpans(
    spansOfTrace => spansOfTrace.filter(span => span.is_segment).length === 3,
  );

  const response = await runner.makeRequest<string>('get', '/overlapping');
  expect(response).toBe('a,b');

  const segmentSpans = (await spansPromise).filter(span => span.is_segment);
  const workerSpan = segmentSpans.find(span => getSpanOp(span) === 'http.server');
  const rpcSpanA = segmentSpans.find(span => span.attributes['test.label']?.value === 'a');
  const rpcSpanB = segmentSpans.find(span => span.attributes['test.label']?.value === 'b');

  // `/overlapping` is a raw URL, so the streamed segment name keeps the method only.
  expect(workerSpan?.name).toBe('GET');
  expect(workerSpan?.attributes['url.path']).toEqual({ type: 'string', value: '/overlapping' });

  expect(rpcSpanA?.name).toBe('work');
  expect(getSpanOp(rpcSpanA!)).toBe('rpc');
  expect(rpcSpanA?.parent_span_id).toBe(workerSpan?.span_id);

  expect(rpcSpanB?.name).toBe('work');
  expect(getSpanOp(rpcSpanB!)).toBe('rpc');
  expect(rpcSpanB?.parent_span_id).toBe(workerSpan?.span_id);

  expect(rpcSpanA?.span_id).not.toBe(rpcSpanB?.span_id);
});
