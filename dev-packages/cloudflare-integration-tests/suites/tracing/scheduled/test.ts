import { expect, it } from 'vitest';
import type { Event } from '@sentry/core';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
} from '@sentry/core';
import { createRunner } from '../../../runner';

it('Scheduled handler creates transaction with correct attributes', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .withWranglerArgs('--test-scheduled')
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1];
      expect(transactionEvent).toEqual(
        expect.objectContaining({
          type: 'transaction',
          transaction: expect.stringMatching(/^Scheduled Cron/),
          transaction_info: { source: 'task' },
          spans: [],
          contexts: expect.objectContaining({
            trace: {
              span_id: expect.any(String),
              trace_id: expect.any(String),
              op: 'function',
              origin: 'auto.faas.cloudflare.scheduled',
              status: 'ok',
              data: {
                [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'function',
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.faas.cloudflare.scheduled',
                [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'task',
                [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
                'faas.cron': expect.any(String),
                'faas.time': expect.any(String),
                'faas.trigger': 'timer',
              },
            },
          }),
        }),
      );
    })
    .start(signal);

  await runner.makeRequest('get', '/__scheduled');
  await runner.completed();
});

it('captures errors thrown by the scheduled handler', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .withWranglerArgs('--test-scheduled')
    .expect(envelope => {
      const event = envelope[1]?.[0]?.[1] as Event;
      expect(event.exception?.values?.[0]?.type).toBe('Error');
      expect(event.exception?.values?.[0]?.value).toBe('Test error from scheduled handler');
      expect(event.exception?.values?.[0]?.mechanism).toEqual({
        type: 'auto.faas.cloudflare.scheduled',
        handled: false,
      });
    })
    .unordered()
    .start(signal);

  await runner.makeRequest('get', `/__scheduled?cron=${encodeURIComponent('0 0 * * *')}`, { expectError: true });
  await runner.completed();
});
