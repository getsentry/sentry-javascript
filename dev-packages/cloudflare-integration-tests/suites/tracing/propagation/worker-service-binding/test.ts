import { expect, it } from 'vitest';
import { SHORT_UUID_MATCHER } from '../../../../expect';
import { createRunner } from '../../../../runner';
import { supports } from '../../../../runtime';
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
  // The worker segment has no parent in this trace. On runtimes with `Span.spanContext()`, its parent is the Cloudflare span.
  const subWorker = segmentSpans.find(span => segmentSpans.some(parent => parent.span_id === span.parent_span_id));
  const worker = segmentSpans.find(span => span !== subWorker);

  expect(worker?.name).toBe('GET /');
  expect(worker?.attributes['sentry.origin']).toEqual({ type: 'string', value: 'auto.http.cloudflare' });

  // `/hello` is a raw URL, so the streamed segment name keeps the method only.
  expect(subWorker?.name).toBe('GET');
  expect(subWorker?.attributes['url.path']).toEqual({ type: 'string', value: '/hello' });
  expect(subWorker?.attributes['sentry.origin']).toEqual({ type: 'string', value: 'auto.http.cloudflare' });

  expect(subWorker?.trace_id).toBe(worker?.trace_id);
  expect(subWorker?.parent_span_id).toBe(worker?.span_id);
  expect(worker?.parent_span_id).toEqual(supports({ minWorkerd: '1.20261009.1' }) ? SHORT_UUID_MATCHER : undefined);
});
