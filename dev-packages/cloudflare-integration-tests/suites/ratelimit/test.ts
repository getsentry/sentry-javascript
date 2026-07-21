import type { Envelope } from '@sentry/core';
import { expect, it } from 'vitest';
import { createRunner } from '../../runner';

function envelopeItemType(envelope: Envelope): string | undefined {
  return envelope[1][0]?.[0]?.type as string | undefined;
}

function envelopeItem(envelope: Envelope): Record<string, unknown> {
  return envelope[1][0]![1] as Record<string, unknown>;
}

function findRateLimitSpans(envelope: Envelope): Array<Record<string, unknown>> {
  if (envelopeItemType(envelope) !== 'transaction') return [];
  const spans = (envelopeItem(envelope).spans as Array<Record<string, unknown>>) || [];
  return spans.filter(
    s => (s.data as Record<string, unknown> | undefined)?.['sentry.origin'] === 'auto.faas.cloudflare.rate_limit',
  );
}

it('instruments an allowed rate limiter call automatically via env', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .ignore('event')
    .expect((envelope: Envelope) => {
      expect(envelopeItemType(envelope)).toBe('transaction');
      const event = envelopeItem(envelope);

      expect(event.spans).toEqual([
        {
          data: {
            'sentry.origin': 'auto.faas.cloudflare.rate_limit',
          },
          description: 'rate_limit MY_RATE_LIMITER',
          origin: 'auto.faas.cloudflare.rate_limit',
          parent_span_id: expect.any(String),
          span_id: expect.any(String),
          start_timestamp: expect.any(Number),
          timestamp: expect.any(Number),
          trace_id: expect.any(String),
        },
      ]);
    })
    .start(signal);

  const response = await runner.makeRequest('get', '/ratelimit/allowed');
  expect(response).toEqual({ success: true });
  await runner.completed();
});

it('instruments a rate-limited call automatically via env', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .ignore('event')
    .expect((envelope: Envelope) => {
      expect(envelopeItemType(envelope)).toBe('transaction');
      // Both `limit()` calls on the blocked endpoint are instrumented.
      expect(findRateLimitSpans(envelope)).toHaveLength(2);
    })
    .start(signal);

  const response = await runner.makeRequest('get', '/ratelimit/blocked');
  expect(response).toEqual({ success: false });
  await runner.completed();
});
