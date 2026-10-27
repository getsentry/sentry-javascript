import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';
import { getSpanOp } from '../../../spanUtils';

// A single request fans out through the whole auto-wrapped chain: default
// handler (`/chain`) → self-bound `CounterEntrypoint` (`/work`) → `Counter`
// Durable Object. All three segment spans arrive only if the build-time
// transform wrapped the default export, the entrypoint, and the DO — and it
// proves a DO invoked from *within* an auto-instrumented entrypoint is itself
// instrumented.
//
// Every route here is a raw URL, so the streamed segment names keep the method
// only and each hop is identified by its `url.path` attribute.
it('auto-instruments a Durable Object invoked from within a WorkerEntrypoint', async ({ signal }) => {
  const runner = createRunner(__dirname).start(signal);

  // Each hop streams from its own isolate, so the three segment spans of the trace arrive in
  // separate envelopes.
  const spansPromise = runner.collectStreamedSpans(
    spansOfTrace => spansOfTrace.filter(span => span.is_segment).length === 3,
  );

  await runner.makeRequest('get', '/chain');

  const spans = await spansPromise;
  const chainSpan = spans.find(span => span.is_segment && span.attributes['url.path']?.value === '/chain');
  const entrypointSpan = spans.find(span => span.is_segment && span.attributes['url.path']?.value === '/work');
  const durableObjectSpan = spans.find(span => span.is_segment && span.attributes['url.path']?.value === '/increment');

  expect(getSpanOp(chainSpan!)).toBe('http.server');
  expect(chainSpan?.attributes['sentry.origin']).toEqual({ type: 'string', value: 'auto.http.cloudflare' });

  expect(getSpanOp(entrypointSpan!)).toBe('http.server');
  expect(entrypointSpan?.parent_span_id).toBe(chainSpan?.span_id);

  expect(getSpanOp(durableObjectSpan!)).toBe('http.server');
  expect(durableObjectSpan?.parent_span_id).toBe(entrypointSpan?.span_id);

  // The `auto.db.cloudflare.durable_object` storage pair (`get` + `put`) is the fingerprint of an
  // instrumented Durable Object.
  expect(
    spans
      .filter(span => span.parent_span_id === durableObjectSpan?.span_id)
      .map(span => ({ name: span.name, op: getSpanOp(span), origin: span.attributes['sentry.origin']?.value })),
  ).toEqual([
    { name: 'durable_object_storage_get', op: 'db', origin: 'auto.db.cloudflare.durable_object' },
    { name: 'durable_object_storage_put', op: 'db', origin: 'auto.db.cloudflare.durable_object' },
  ]);
});
