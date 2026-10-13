import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';
import { getSpanOp } from '../../../spanUtils';

// A single worker exports a plain `WorkerEntrypoint`, a plain `DurableObject`,
// and a plain default handler. The runner builds it with the Sentry Vite plugin
// (auto-instrumentation on) and serves the output — so every span below only
// arrives if the build-time transform wrapped all three: `withSentry` for the
// default export, the self-bound `GreeterEntrypoint`, and `Counter` via
// `instrumentDurableObjectWithSentry`.
//
// Every route here is a raw URL, so the streamed segment names keep the method
// only and each hop is identified by its `url.path` attribute.
it('auto-instruments a WorkerEntrypoint and a Durable Object exported from the same worker', async ({ signal }) => {
  const runner = createRunner(__dirname).start(signal);

  // Each hop streams from its own isolate, so the segment spans of a trace arrive in separate
  // envelopes.
  const entrypointSpansPromise = runner.collectStreamedSpans(spansOfTrace => {
    const paths = spansOfTrace.filter(span => span.is_segment).map(span => span.attributes['url.path']?.value);
    return paths.includes('/call-entrypoint') && paths.includes('/greet');
  });

  await runner.makeRequest('get', '/call-entrypoint');

  const entrypointTraceSpans = await entrypointSpansPromise;
  const callEntrypointSpan = entrypointTraceSpans.find(
    span => span.is_segment && span.attributes['url.path']?.value === '/call-entrypoint',
  );
  const greetSpan = entrypointTraceSpans.find(
    span => span.is_segment && span.attributes['url.path']?.value === '/greet',
  );

  expect(getSpanOp(callEntrypointSpan!)).toBe('http.server');
  expect(callEntrypointSpan?.attributes['sentry.origin']).toEqual({ type: 'string', value: 'auto.http.cloudflare' });

  expect(getSpanOp(greetSpan!)).toBe('http.server');
  expect(greetSpan?.attributes['sentry.origin']).toEqual({ type: 'string', value: 'auto.http.cloudflare' });
  expect(greetSpan?.parent_span_id).toBe(callEntrypointSpan?.span_id);

  const durableObjectSpansPromise = runner.collectStreamedSpans(
    spansOfTrace =>
      spansOfTrace.filter(span => span.is_segment).length === 2 &&
      spansOfTrace.some(span => span.attributes['url.path']?.value === '/increment'),
  );

  await runner.makeRequest('get', '/increment');

  const durableObjectTraceSpans = await durableObjectSpansPromise;
  const workerSpan = durableObjectTraceSpans.find(span => span.is_segment && !span.parent_span_id);
  const durableObjectSpan = durableObjectTraceSpans.find(span => span.is_segment && span.parent_span_id);

  expect(getSpanOp(workerSpan!)).toBe('http.server');
  expect(getSpanOp(durableObjectSpan!)).toBe('http.server');
  expect(durableObjectSpan?.parent_span_id).toBe(workerSpan?.span_id);

  // The `auto.db.cloudflare.durable_object` storage pair (`get` + `put`) is the fingerprint of an
  // instrumented Durable Object.
  expect(
    durableObjectTraceSpans
      .filter(span => span.parent_span_id === durableObjectSpan?.span_id)
      .map(span => ({ name: span.name, op: getSpanOp(span), origin: span.attributes['sentry.origin']?.value })),
  ).toEqual([
    { name: 'durable_object_storage_get', op: 'db', origin: 'auto.db.cloudflare.durable_object' },
    { name: 'durable_object_storage_put', op: 'db', origin: 'auto.db.cloudflare.durable_object' },
  ]);
});
