import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';
import { getSpanOp } from '../../../spanUtils';

// `Counter` is manually wrapped with `instrumentDurableObjectWithSentry` in a
// separate module (`./counter`), imported into the entry, and re-exported via a
// plain `export { Counter }`. Because `Counter` is an imported binding rather
// than a local class declaration, the transform cannot wrap it in the entry and
// must leave it alone — no double-wrap, no broken build. The DO stays
// instrumented via the manual wrap, so we still expect a storage-bearing DO
// segment span, alongside the auto-wrapped default export's child-less one.
it('leaves an imported, already-instrumented Durable Object untouched and still wraps the default export', async ({
  signal,
}) => {
  const runner = createRunner(__dirname).start(signal);

  // The worker and the Durable Object stream from separate isolates, so the two segment spans of
  // the trace arrive in separate envelopes.
  const spansPromise = runner.collectStreamedSpans(
    spansOfTrace => spansOfTrace.filter(span => span.is_segment).length === 2,
  );

  await runner.makeRequest('get', '/increment');

  const spans = await spansPromise;
  const workerSpan = spans.find(span => span.is_segment && !span.parent_span_id);
  const durableObjectSpan = spans.find(span => span.is_segment && span.parent_span_id);

  expect(getSpanOp(workerSpan!)).toBe('http.server');
  expect(workerSpan?.attributes['sentry.origin']).toEqual({ type: 'string', value: 'auto.http.cloudflare' });

  expect(getSpanOp(durableObjectSpan!)).toBe('http.server');
  expect(durableObjectSpan?.attributes['sentry.origin']).toEqual({ type: 'string', value: 'auto.http.cloudflare' });
  expect(durableObjectSpan?.parent_span_id).toBe(workerSpan?.span_id);

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
