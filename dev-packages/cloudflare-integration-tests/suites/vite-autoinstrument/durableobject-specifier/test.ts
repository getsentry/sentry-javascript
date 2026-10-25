import { expect, it } from 'vitest';
import { SHORT_UUID_MATCHER } from '../../../expect';
import { createRunner } from '../../../runner';
import { supports } from '../../../runtime';
import { getSpanOp } from '../../../spanUtils';

// The Durable Object is exported through a specifier list (`export { Counter }`)
// instead of an inline `export class`. The transform renames the class to
// `__SENTRY_ORIGINAL_Counter__` and rebinds `Counter` to the wrapped class, so
// the DO storage spans only arrive if that specifier form was handled.
it('auto-instruments a Durable Object exported via a specifier list', async ({ signal }) => {
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
