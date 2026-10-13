import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';
import { getSpanOp } from '../../../spanUtils';

// `GreeterEntrypoint` is hand-wrapped in `./greeter` and only re-exported by
// the entry, so the transform's emitted `_INTERNAL_wrapUnlessInstrumented`
// guard must hand the manual wrap back instead of nesting a second wrapper.
// A nested wrapper throws inside the entrypoint and fails the request. The
// child-less assertion below catches a nested wrapper that runs without an
// error but instruments `fetch` a second time.
it('does not double-instrument an imported, already-wrapped WorkerEntrypoint', async ({ signal }) => {
  const runner = createRunner(__dirname).start(signal);

  // The default handler and the entrypoint stream from separate isolates, so the two segment spans
  // of the trace arrive in separate envelopes.
  const spansPromise = runner.collectStreamedSpans(
    spansOfTrace => spansOfTrace.filter(span => span.is_segment).length === 2,
  );

  await runner.makeRequest('get', '/call-entrypoint');

  const spans = await spansPromise;
  // Both routes are raw URLs, so the streamed segment names keep the method only and the route is
  // read from `url.path`.
  const workerSpan = spans.find(span => span.is_segment && span.attributes['url.path']?.value === '/call-entrypoint');
  const entrypointSpan = spans.find(span => span.is_segment && span.attributes['url.path']?.value === '/greet');

  // The auto-wrapped default export's segment span.
  expect(workerSpan?.name).toBe('GET');
  expect(getSpanOp(workerSpan!)).toBe('http.server');

  expect(entrypointSpan?.name).toBe('GET');
  expect(getSpanOp(entrypointSpan!)).toBe('http.server');
  expect(entrypointSpan?.parent_span_id).toBe(workerSpan?.span_id);
  // The entrypoint's spans stay buffered until its invocation flushes, so a child span would arrive
  // in the same envelope as the entrypoint's segment span.
  expect(spans.filter(span => span.parent_span_id === entrypointSpan?.span_id)).toEqual([]);
});
