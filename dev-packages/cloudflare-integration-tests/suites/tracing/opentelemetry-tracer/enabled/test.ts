import { SENTRY_KIND, SENTRY_ORIGIN, SENTRY_SOURCE } from '@sentry/conventions/attributes';
import type { Event } from '@sentry/core';
import { expect, it } from 'vitest';
import { SHORT_UUID_MATCHER, UUID_MATCHER } from '../../../../expect';
import { createRunner } from '../../../../runner';

// One request produces two transactions, so both are asserted in a single test — every
// `createRunner` spawns its own `wrangler dev`, and a cold workerd boot dwarfs the assertions.
// Each callback leads with the transaction name: in unordered mode the runner matches an envelope
// by trying the callbacks until one does not throw, so that first assertion selects the envelope.
it('captures spans emitted through @opentelemetry/api and nests them with Sentry spans', async ({ signal }) => {
  let requestTraceId: string | undefined;
  let otelTraceId: string | undefined;

  const runner = createRunner(__dirname)
    .expect(envelope => {
      const event = envelope[1]?.[0]?.[1] as Event;
      expect(event.transaction).toBe('GET /');

      // An inactive OTel span carries no explicit context, so the tracer falls back to the Sentry
      // active span — the incoming request span — and the span lands in the request transaction.
      expect(event.spans).toEqual([
        {
          data: { [SENTRY_ORIGIN]: 'manual', 'test.attribute': 'inactive' },
          description: 'otel inactive',
          parent_span_id: event.contexts?.trace?.span_id,
          span_id: SHORT_UUID_MATCHER,
          start_timestamp: expect.any(Number),
          status: 'ok',
          timestamp: expect.any(Number),
          trace_id: event.contexts?.trace?.trace_id,
          origin: 'manual',
        },
      ]);

      requestTraceId = event.contexts?.trace?.trace_id;
    })
    .expect(envelope => {
      const event = envelope[1]?.[0]?.[1] as Event;
      expect(event.transaction).toBe('otel parent');

      // `startActiveSpan` always resolves an explicit context, and Cloudflare installs no OTel
      // context manager — so `context.active()` never carries the request span and the span becomes
      // a root of its own. The absent `parent_span_id` below is what proves the detachment.
      expect(event.contexts?.trace).toEqual({
        data: {
          [SENTRY_ORIGIN]: 'manual',
          [SENTRY_SOURCE]: 'custom',
          'sentry.sample_rate': 1,
          [SENTRY_KIND]: 'client',
          'test.attribute': 'parent',
        },
        span_id: SHORT_UUID_MATCHER,
        trace_id: UUID_MATCHER,
        status: 'ok',
        origin: 'manual',
      });

      // Below that root the two APIs interleave correctly: the tracer publishes its active span on
      // the Sentry scope, so the Sentry span picks it up as parent and the next OTel span picks up
      // the Sentry one in turn. Spans are ordered by start time, so `sentry child` comes first.
      const sentryChildSpanId = event.spans?.[0]?.span_id;

      expect(event.spans).toEqual([
        {
          data: { [SENTRY_ORIGIN]: 'manual' },
          description: 'sentry child',
          parent_span_id: event.contexts?.trace?.span_id,
          span_id: SHORT_UUID_MATCHER,
          start_timestamp: expect.any(Number),
          status: 'ok',
          timestamp: expect.any(Number),
          trace_id: event.contexts?.trace?.trace_id,
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
          trace_id: event.contexts?.trace?.trace_id,
          origin: 'manual',
        },
      ]);

      otelTraceId = event.contexts?.trace?.trace_id;
    })
    .unordered()
    .start(signal);

  await runner.makeRequest('get', '/');
  await runner.completed();

  // Detaching from the request span does not start a new trace — both transactions stay together.
  expect(requestTraceId).toEqual(UUID_MATCHER);
  expect(otelTraceId).toBe(requestTraceId);
});
