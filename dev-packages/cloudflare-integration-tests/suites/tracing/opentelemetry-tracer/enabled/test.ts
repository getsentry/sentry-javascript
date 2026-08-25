import { SENTRY_KIND, SENTRY_ORIGIN } from '@sentry/conventions/attributes';
import type { Event } from '@sentry/core';
import { expect, it } from 'vitest';
import { SHORT_UUID_MATCHER } from '../../../../expect';
import { createRunner } from '../../../../runner';

it('captures spans emitted through @opentelemetry/api and nests them with Sentry spans', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const event = envelope[1]?.[0]?.[1] as Event;
      expect(event.transaction).toBe('GET /');

      const requestSpanId = event.contexts?.trace?.span_id;
      const traceId = event.contexts?.trace?.trace_id;

      // Cloudflare installs no OTel context manager, so `context.active()` never carries a span.
      // Neither tracer API passes an explicit context here, so both fall back to the Sentry active
      // span — the incoming request span — and everything stays in the request transaction.
      const otelParentSpanId = event.spans?.[1]?.span_id;
      const sentryChildSpanId = event.spans?.[2]?.span_id;

      // Spans are ordered by start time.
      expect(event.spans).toEqual([
        {
          data: { [SENTRY_ORIGIN]: 'manual', 'test.attribute': 'inactive' },
          description: 'otel inactive',
          parent_span_id: requestSpanId,
          span_id: SHORT_UUID_MATCHER,
          start_timestamp: expect.any(Number),
          status: 'ok',
          timestamp: expect.any(Number),
          trace_id: traceId,
          origin: 'manual',
        },
        {
          data: { [SENTRY_ORIGIN]: 'manual', [SENTRY_KIND]: 'client', 'test.attribute': 'parent' },
          description: 'otel parent',
          parent_span_id: requestSpanId,
          span_id: SHORT_UUID_MATCHER,
          start_timestamp: expect.any(Number),
          status: 'ok',
          timestamp: expect.any(Number),
          trace_id: traceId,
          origin: 'manual',
        },
        // Below the OTel parent the two APIs interleave correctly: the tracer publishes its active
        // span on the Sentry scope, so the Sentry span picks it up as parent and the next OTel span
        // picks up the Sentry one in turn.
        {
          data: { [SENTRY_ORIGIN]: 'manual' },
          description: 'sentry child',
          parent_span_id: otelParentSpanId,
          span_id: SHORT_UUID_MATCHER,
          start_timestamp: expect.any(Number),
          status: 'ok',
          timestamp: expect.any(Number),
          trace_id: traceId,
          origin: 'manual',
        },
        {
          data: { [SENTRY_ORIGIN]: 'manual', 'test.attribute': 'grandchild' },
          description: 'otel grandchild',
          parent_span_id: sentryChildSpanId,
          span_id: SHORT_UUID_MATCHER,
          start_timestamp: expect.any(Number),
          status: 'ok',
          timestamp: expect.any(Number),
          trace_id: traceId,
          origin: 'manual',
        },
        // Without an OTel context manager `context.with` cannot restore anything, so the tracer has to
        // fork the scope itself. Otherwise the finished `otel parent` would stay active and both of
        // these would hang off it instead of the request span.
        {
          data: { [SENTRY_ORIGIN]: 'manual', 'test.attribute': 'after' },
          description: 'otel after active',
          parent_span_id: requestSpanId,
          span_id: SHORT_UUID_MATCHER,
          start_timestamp: expect.any(Number),
          status: 'ok',
          timestamp: expect.any(Number),
          trace_id: traceId,
          origin: 'manual',
        },
        {
          data: { [SENTRY_ORIGIN]: 'manual' },
          description: 'sentry after active',
          parent_span_id: requestSpanId,
          span_id: SHORT_UUID_MATCHER,
          start_timestamp: expect.any(Number),
          status: 'ok',
          timestamp: expect.any(Number),
          trace_id: traceId,
          origin: 'manual',
        },
      ]);
    })
    .start(signal);

  await runner.makeRequest('get', '/');
  await runner.completed();
});
