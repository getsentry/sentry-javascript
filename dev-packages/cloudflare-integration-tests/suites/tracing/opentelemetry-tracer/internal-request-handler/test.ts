import { SENTRY_ORIGIN } from '@sentry/conventions/attributes';
import type { Event } from '@sentry/core';
import { expect, it } from 'vitest';
import { SHORT_UUID_MATCHER } from '../../../../expect';
import { createRunner } from '../../../../runner';

it('captures spans emitted through @opentelemetry/api inside _INTERNAL_wrapRequestHandler', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const event = envelope[1]?.[0]?.[1] as Event;
      expect(event.transaction).toBe('GET /');
      expect(event.contexts?.trace?.op).toBe('http.server');

      const requestSpanId = event.contexts?.trace?.span_id;
      const traceId = event.contexts?.trace?.trace_id;
      const handleSpanId = event.spans?.[0]?.span_id;
      const sentryChildSpanId = event.spans?.[1]?.span_id;

      // Spans are ordered by start time.
      expect(event.spans).toEqual([
        {
          data: { [SENTRY_ORIGIN]: 'manual' },
          description: 'sveltekit.handle.root',
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
          description: 'sentry child',
          parent_span_id: handleSpanId,
          span_id: SHORT_UUID_MATCHER,
          start_timestamp: expect.any(Number),
          status: 'ok',
          timestamp: expect.any(Number),
          trace_id: traceId,
          origin: 'manual',
        },
        {
          data: { [SENTRY_ORIGIN]: 'manual', 'http.route': '/' },
          description: 'sveltekit.resolve',
          parent_span_id: sentryChildSpanId,
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
