import { expect, it } from 'vitest';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
} from '@sentry/core';
import { createRunner } from '../../../runner';

it('Workflow steps create transactions with correct attributes', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1];
      expect(transactionEvent).toEqual(
        expect.objectContaining({
          type: 'transaction',
          transaction: 'step-one',
          transaction_info: { source: 'task' },
          spans: [],
          contexts: expect.objectContaining({
            trace: {
              span_id: expect.any(String),
              trace_id: expect.any(String),
              op: 'function.step.do',
              origin: 'auto.faas.cloudflare.workflow',
              status: 'ok',
              data: {
                [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'function.step.do',
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.faas.cloudflare.workflow',
                [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'task',
                [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
              },
            },
          }),
        }),
      );
    })
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1];
      expect(transactionEvent).toEqual(
        expect.objectContaining({
          type: 'transaction',
          transaction: 'step-two',
          transaction_info: { source: 'task' },
          spans: [],
          contexts: expect.objectContaining({
            trace: {
              span_id: expect.any(String),
              trace_id: expect.any(String),
              op: 'function.step.do',
              origin: 'auto.faas.cloudflare.workflow',
              status: 'ok',
              data: {
                [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'function.step.do',
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.faas.cloudflare.workflow',
                [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'task',
                [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: 1,
              },
            },
          }),
        }),
      );
    })
    .unordered()
    .start(signal);

  await runner.makeRequest('get', '/workflow/trigger');
  await runner.completed();
});
