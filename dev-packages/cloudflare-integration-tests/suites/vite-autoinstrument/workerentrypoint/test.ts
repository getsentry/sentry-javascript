import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';
import { getSpanOp } from '../../../spanUtils';

// The worker is built by the Sentry Vite plugin (auto-instrumentation on). The
// runner detects `vite.config.mts`, runs `vite build`, and serves the generated
// output — so these spans only arrive if the build-time transform wrapped both
// the default handler and the self-bound `GreeterEntrypoint`.
it('auto-instruments the default handler and a self-bound WorkerEntrypoint', async ({ signal }) => {
  const runner = createRunner(__dirname).start(signal);

  // The default handler and the entrypoint stream from separate isolates, so the two segment spans
  // of the trace arrive in separate envelopes.
  const spansPromise = runner.collectStreamedSpans(
    spansOfTrace => spansOfTrace.filter(span => span.is_segment).length === 2,
  );

  await runner.makeRequest('get', '/call-entrypoint');

  const segmentSpans = (await spansPromise).filter(span => span.is_segment);
  // Both routes are raw URLs, so the streamed segment names keep the method only and the route is
  // read from `url.path`.
  const workerSpan = segmentSpans.find(span => span.attributes['url.path']?.value === '/call-entrypoint');
  const entrypointSpan = segmentSpans.find(span => span.attributes['url.path']?.value === '/greet');

  // Main worker span — proves `withSentry` wrapped the unwrapped default export.
  expect(workerSpan?.name).toBe('GET');
  expect(getSpanOp(workerSpan!)).toBe('http.server');

  // The entrypoint's own span — proves the auto-wrap identified and wrapped the named
  // `WorkerEntrypoint`.
  expect(entrypointSpan?.name).toBe('GET');
  expect(getSpanOp(entrypointSpan!)).toBe('http.server');
  expect(entrypointSpan?.parent_span_id).toBe(workerSpan?.span_id);
});
