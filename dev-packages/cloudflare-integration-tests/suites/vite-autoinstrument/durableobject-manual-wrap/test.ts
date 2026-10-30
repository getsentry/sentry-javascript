import { expect, it } from 'vitest';
import { SHORT_UUID_MATCHER } from '../../../expect';
import { createRunner } from '../../../runner';
import { supports } from '../../../runtime';
import { getSpanOp } from '../../../spanUtils';

// The Durable Object is already wrapped manually with
// `Sentry.instrumentDurableObjectWithSentry`. The transform must recognize the
// existing wrap and NOT wrap it again (a double-wrap would either break the
// build or nest proxies), while still auto-wrapping the plain default export.
// We therefore expect exactly one storage-bearing DO segment span (from the
// manual wrap) and one child-less main-worker segment span (from the auto wrap).
it('leaves a manually wrapped Durable Object untouched and still wraps the default export', async ({ signal }) => {
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

  // The `auto.db.cloudflare.durable_object` storage pair (`get` + `put`) is the fingerprint of an
  // instrumented Durable Object. Exactly two of them also rules out a double-wrap.
  expect(
    spans
      .filter(span => span.parent_span_id === durableObjectSpan?.span_id)
      .map(span => ({ name: span.name, op: getSpanOp(span), origin: span.attributes['sentry.origin']?.value })),
  ).toEqual([
    { name: 'durable_object_storage_get', op: 'db', origin: 'auto.db.cloudflare.durable_object' },
    { name: 'durable_object_storage_put', op: 'db', origin: 'auto.db.cloudflare.durable_object' },
  ]);
});
