import { SENTRY_ORIGIN } from '@sentry/conventions/attributes';
import { expect, it } from 'vitest';
import { createRunner } from '../../../../runner';
import { getSpanOp } from '../../../../spanUtils';

it('captures spans emitted through @opentelemetry/api inside _INTERNAL_wrapRequestHandler', async ({ signal }) => {
  const runner = createRunner(__dirname).start(signal);

  // The segment span arrives in its own envelope. It ends after the children it wraps, but each
  // envelope is its own request to the mock server, so it can still be received first. Waiting for
  // the three children by name rather than for the segment keeps the assertions below reliable.
  const spansPromise = runner.collectStreamedSpans(
    spansOfTrace =>
      ['sveltekit.handle.root', 'sentry child', 'sveltekit.resolve'].every(name =>
        spansOfTrace.some(span => span.name === name),
      ) && spansOfTrace.some(span => span.is_segment),
  );

  await runner.makeRequest('get', '/');

  const spans = await spansPromise;
  const segmentSpan = spans.find(span => span.is_segment);
  expect(getSpanOp(segmentSpan!)).toBe('http.server');

  const handleSpan = spans.find(span => span.name === 'sveltekit.handle.root');
  const sentryChild = spans.find(span => span.name === 'sentry child');
  const resolveSpan = spans.find(span => span.name === 'sveltekit.resolve');

  for (const span of spans.filter(span => !span.is_segment)) {
    expect(span.trace_id).toBe(segmentSpan?.trace_id);
    expect(span.status).toBe('ok');
    expect(span.attributes[SENTRY_ORIGIN]).toEqual({ type: 'string', value: 'manual' });
  }

  expect(handleSpan?.parent_span_id).toBe(segmentSpan?.span_id);
  expect(sentryChild?.parent_span_id).toBe(handleSpan?.span_id);
  expect(resolveSpan?.parent_span_id).toBe(sentryChild?.span_id);
  expect(resolveSpan?.attributes['http.route']).toEqual({ type: 'string', value: '/' });
});
