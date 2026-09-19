import { expect, it } from 'vitest';
import { createRunner } from '../../../../runner';
import { getSpanOp } from '../../../../spanUtils';

it('propagates trace from worker to worker via service binding', async ({ signal }) => {
  const runner = createRunner(__dirname).start(signal);

  // The worker and the sub-worker stream from separate isolates, so the two segment spans of the
  // trace arrive in separate envelopes.
  const spansPromise = runner.collectStreamedSpans(
    spansOfTrace => spansOfTrace.filter(span => span.is_segment && getSpanOp(span) === 'http.server').length === 2,
  );

  await runner.makeRequest('get', '/');

  const segmentSpans = (await spansPromise).filter(span => span.is_segment);
  const worker = segmentSpans.find(span => !span.parent_span_id);
  const subWorker = segmentSpans.find(span => span.parent_span_id);

  expect(worker?.name).toBe('GET /');
  expect(worker?.attributes['sentry.origin']).toEqual({ type: 'string', value: 'auto.http.cloudflare' });

  // `/hello` is a raw URL, so the streamed segment name keeps the method only.
  expect(subWorker?.name).toBe('GET');
  expect(subWorker?.attributes['url.path']).toEqual({ type: 'string', value: '/hello' });
  expect(subWorker?.attributes['sentry.origin']).toEqual({ type: 'string', value: 'auto.http.cloudflare' });

  expect(subWorker?.trace_id).toBe(worker?.trace_id);
  expect(subWorker?.parent_span_id).toBe(worker?.span_id);
});
