import { expect, it } from 'vitest';
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
              op: 'faas.cron',
              origin: 'auto.faas.cloudflare.scheduled',
              data: {
                [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'faas.cron',
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
