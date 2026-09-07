import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';
import { getSpanOp } from '../../../spanUtils';

// One DO (`Manual`) is wrapped by hand, the other (`Auto`) is a plain inline
// export. Both are bound in wrangler. The transform must skip the manual one and
// auto-wrap only `Auto` — so both endpoints report a storage-bearing DO segment
// span (one from the manual wrap, one from the auto wrap) without
// double-instrumenting `Manual`.
it('wraps only the unwrapped Durable Object when a sibling is manually wrapped', async ({ signal }) => {
  const runner = createRunner(__dirname).start(signal);

  // Each request runs in its own trace, and inside a trace the worker and the Durable Object stream
  // from separate isolates. One collector per request therefore waits for that trace's two segment
  // spans.
  for (const path of ['/manual', '/auto']) {
    const spansPromise = runner.collectStreamedSpans(
      spansOfTrace => spansOfTrace.filter(span => span.is_segment).length === 2,
    );

    await runner.makeRequest('get', path);

    const spans = await spansPromise;
    const workerSpan = spans.find(span => span.is_segment && !span.parent_span_id);
    const durableObjectSpan = spans.find(span => span.is_segment && span.parent_span_id);

    expect(getSpanOp(workerSpan!)).toBe('http.server');
    expect(workerSpan?.attributes['url.path']).toEqual({ type: 'string', value: path });

    expect(getSpanOp(durableObjectSpan!)).toBe('http.server');
    expect(durableObjectSpan?.attributes['sentry.origin']).toEqual({ type: 'string', value: 'auto.http.cloudflare' });
    expect(durableObjectSpan?.parent_span_id).toBe(workerSpan?.span_id);

    // The `auto.db.cloudflare.durable_object` storage pair (`get` + `put`) is the fingerprint of an
    // instrumented Durable Object. Exactly two of them also rules out a double-wrap of `Manual`.
    expect(
      spans
        .filter(span => span.parent_span_id === durableObjectSpan?.span_id)
        .map(span => ({ name: span.name, op: getSpanOp(span), origin: span.attributes['sentry.origin']?.value })),
    ).toEqual([
      { name: 'durable_object_storage_get', op: 'db', origin: 'auto.db.cloudflare.durable_object' },
      { name: 'durable_object_storage_put', op: 'db', origin: 'auto.db.cloudflare.durable_object' },
    ]);
  }
});
