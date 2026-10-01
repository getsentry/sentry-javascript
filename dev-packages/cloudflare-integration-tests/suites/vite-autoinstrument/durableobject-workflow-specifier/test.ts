import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';
import { getSpanOp } from '../../../spanUtils';

// A Durable Object and a Workflow are both exported through a single specifier
// list (`export { Counter, MyWorkflow }`) instead of inline `export class`. The
// transform renames each local class and rebinds the exported name to the
// kind-specific wrapper, so the DO storage spans and the `step-one` segment span
// only arrive if the specifier form was handled for both kinds.
it('auto-instruments a Durable Object and a Workflow exported via a specifier list', async ({ signal }) => {
  const runner = createRunner(__dirname).start(signal);

  // The workflow step runs in its own trace, separate from either request.
  const stepSpansPromise = runner.collectStreamedSpansUntilSegment('step-one');
  // The worker and the Durable Object stream from separate isolates, so the two segment spans of
  // the `/increment` trace arrive in separate envelopes.
  const durableObjectSpansPromise = runner.collectStreamedSpans(
    spansOfTrace => spansOfTrace.filter(span => span.is_segment).length === 2,
  );

  await runner.makeRequest('get', '/increment');

  const spans = await durableObjectSpansPromise;
  const workerSpan = spans.find(span => span.is_segment && !span.parent_span_id);
  const durableObjectSpan = spans.find(span => span.is_segment && span.parent_span_id);

  expect(getSpanOp(workerSpan!)).toBe('http.server');
  expect(workerSpan?.attributes['sentry.origin']).toEqual({ type: 'string', value: 'auto.http.cloudflare' });

  expect(getSpanOp(durableObjectSpan!)).toBe('http.server');
  expect(durableObjectSpan?.parent_span_id).toBe(workerSpan?.span_id);

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

  await runner.makeRequest('get', '/workflow/trigger');

  const stepSpan = (await stepSpansPromise).find(span => span.name === 'step-one');
  expect(getSpanOp(stepSpan!)).toBe('function');
  expect(stepSpan?.attributes['sentry.origin']).toEqual({ type: 'string', value: 'auto.faas.cloudflare.workflow' });
});
