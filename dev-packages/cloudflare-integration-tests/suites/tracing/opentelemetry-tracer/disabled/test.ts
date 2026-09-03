import { SENTRY_ORIGIN } from '@sentry/conventions/attributes';
import type { Event } from '@sentry/core';
import { expect, it } from 'vitest';
import { SHORT_UUID_MATCHER } from '../../../../expect';
import { createRunner } from '../../../../runner';

it('drops spans emitted through @opentelemetry/api when `enableOpenTelemetrySetup` is not enabled', async ({
  signal,
}) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as Event;

      expect(transactionEvent.transaction).toBe('GET /');

      // Only the Sentry span survives; it re-parents onto the request span because the noop OTel
      // span it was nested under never became a real parent.
      expect(transactionEvent.spans).toEqual([
        {
          data: { [SENTRY_ORIGIN]: 'manual' },
          description: 'sentry child',
          parent_span_id: transactionEvent.contexts?.trace?.span_id,
          span_id: SHORT_UUID_MATCHER,
          start_timestamp: expect.any(Number),
          status: 'ok',
          timestamp: expect.any(Number),
          trace_id: transactionEvent.contexts?.trace?.trace_id,
          origin: 'manual',
        },
      ]);
    })
    .start(signal);

  await runner.makeRequest('get', '/');
  await runner.completed();
});
