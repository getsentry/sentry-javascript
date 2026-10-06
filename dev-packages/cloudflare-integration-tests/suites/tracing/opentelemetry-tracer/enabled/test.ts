import { SENTRY_KIND, SENTRY_ORIGIN } from '@sentry/conventions/attributes';
import type { SerializedStreamedSpan } from '@sentry/core';
import { expect, it } from 'vitest';
import { createRunner } from '../../../../runner';
import { getSpansFromEnvelope } from '../../../../spanUtils';

it('captures spans emitted through @opentelemetry/api and nests them with Sentry spans', async ({ signal }) => {
  let spans: SerializedStreamedSpan[] = [];

  const runner = createRunner(__dirname)
    .expect(envelope => {
      const envelopeSpans = getSpansFromEnvelope(envelope);

      expect(envelopeSpans).toHaveLength(7);
      spans = envelopeSpans;
    })
    .start(signal);

  await runner.makeRequest('get', '/');
  await runner.completed();

  // Start timestamps tie at millisecond resolution, so the spans are matched by name rather than
  // by order.
  const segmentSpan = spans.find(span => span.is_segment);
  expect(segmentSpan?.name).toBe('GET /');

  const otelInactive = spans.find(span => span.name === 'otel inactive');
  const otelParent = spans.find(span => span.name === 'otel parent');
  const sentryChild = spans.find(span => span.name === 'sentry child');
  const otelGrandchild = spans.find(span => span.name === 'otel grandchild');
  const otelAfterActive = spans.find(span => span.name === 'otel after active');
  const sentryAfterActive = spans.find(span => span.name === 'sentry after active');

  for (const span of spans.filter(span => !span.is_segment)) {
    expect(span.trace_id).toBe(segmentSpan?.trace_id);
    expect(span.status).toBe('ok');
    expect(span.attributes[SENTRY_ORIGIN]).toEqual({ type: 'string', value: 'manual' });
  }

  // Cloudflare installs no OTel context manager, so `context.active()` never carries a span.
  // Neither tracer API passes an explicit context here, so both fall back to the Sentry active
  // span, the incoming request span, and everything stays under the segment.
  expect(otelInactive?.parent_span_id).toBe(segmentSpan?.span_id);
  expect(otelInactive?.attributes['test.attribute']).toEqual({ type: 'string', value: 'inactive' });

  expect(otelParent?.parent_span_id).toBe(segmentSpan?.span_id);
  expect(otelParent?.attributes['test.attribute']).toEqual({ type: 'string', value: 'parent' });
  expect(otelParent?.attributes[SENTRY_KIND]).toEqual({ type: 'string', value: 'client' });

  // Below the OTel parent the two APIs interleave correctly: the tracer publishes its active span
  // on the Sentry scope, so the Sentry span picks it up as parent and the next OTel span picks up
  // the Sentry one in turn.
  expect(sentryChild?.parent_span_id).toBe(otelParent?.span_id);
  expect(otelGrandchild?.parent_span_id).toBe(sentryChild?.span_id);
  expect(otelGrandchild?.attributes['test.attribute']).toEqual({ type: 'string', value: 'grandchild' });

  // Without an OTel context manager `context.with` cannot restore anything, so the tracer has to
  // fork the scope itself. Otherwise the finished `otel parent` would stay active and both of these
  // would hang off it instead of the segment span.
  expect(otelAfterActive?.parent_span_id).toBe(segmentSpan?.span_id);
  expect(otelAfterActive?.attributes['test.attribute']).toEqual({ type: 'string', value: 'after' });
  expect(sentryAfterActive?.parent_span_id).toBe(segmentSpan?.span_id);
});
