import { expect, it } from 'vitest';
import { SHORT_UUID_MATCHER } from '../../../expect';
import { createRunner } from '../../../runner';
import { supports } from '../../../runtime';
import { getSpanOp } from '../../../spanUtils';

// A Durable Object invoked via `fetch` gets its own `http.server` /
// `auto.http.cloudflare` segment span (its `fetch` is wrapped with
// `wrapRequestHandler`, not the faas wrapper used for alarms/websockets/RPC).
// The proof the class was auto-instrumented is the pair of
// `auto.db.cloudflare.durable_object` storage spans (`get` + `put`) it emits —
// absent entirely when the class is left unwrapped.
//
// The worker is built by the Sentry Vite plugin (auto-instrumentation on). The
// runner detects `vite.config.mts`, runs `vite build`, and serves the generated
// output — so these spans only arrive if the build-time transform wrapped both
// the default handler (`withSentry`) and the `Counter` Durable Object
// (`instrumentDurableObjectWithSentry`).
it('auto-instruments the default handler and a Durable Object', async ({ signal }) => {
  const runner = createRunner(__dirname).start(signal);

  // The worker and the Durable Object stream from separate isolates, so the two segment spans of
  // the trace arrive in separate envelopes.
  const spansPromise = runner.collectStreamedSpans(
    spansOfTrace => spansOfTrace.filter(span => span.is_segment).length === 2,
  );

  await runner.makeRequest('get', '/increment');

  const spans = await spansPromise;
  // The worker segment has no parent in this trace. On runtimes with `Span.spanContext()`, its parent is the Cloudflare span.
  const durableObjectSpan = spans.find(
    span => span.is_segment && spans.some(parent => parent.span_id === span.parent_span_id),
  );
  const workerSpan = spans.find(span => span.is_segment && span !== durableObjectSpan);

  expect(getSpanOp(workerSpan!)).toBe('http.server');
  expect(workerSpan?.attributes['sentry.origin']).toEqual({ type: 'string', value: 'auto.http.cloudflare' });

  expect(getSpanOp(durableObjectSpan!)).toBe('http.server');
  expect(durableObjectSpan?.attributes['sentry.origin']).toEqual({ type: 'string', value: 'auto.http.cloudflare' });
  expect(durableObjectSpan?.parent_span_id).toBe(workerSpan?.span_id);
  expect(workerSpan?.parent_span_id).toEqual(supports({ minWorkerd: '1.20261009.1' }) ? SHORT_UUID_MATCHER : undefined);

  expect(
    spans
      .filter(span => span.parent_span_id === durableObjectSpan?.span_id)
      .map(span => ({ name: span.name, op: getSpanOp(span), origin: span.attributes['sentry.origin']?.value })),
  ).toEqual([
    { name: 'durable_object_storage_get', op: 'db', origin: 'auto.db.cloudflare.durable_object' },
    { name: 'durable_object_storage_put', op: 'db', origin: 'auto.db.cloudflare.durable_object' },
  ]);
});
