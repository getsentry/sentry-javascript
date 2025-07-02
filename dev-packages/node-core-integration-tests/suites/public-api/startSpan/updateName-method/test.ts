import { SEMANTIC_ATTRIBUTE_SENTRY_SOURCE } from '@sentry/node-core';
import { afterAll, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('updates the span name when calling `span.updateName`', async () => {
  createRunner(__dirname, 'scenario.ts')
    .expect({
      transaction: {
        transaction: 'new name',
        transaction_info: { source: 'url' },
        contexts: {
          trace: {
            span_id: expect.any(String),
            trace_id: expect.any(String),
            data: { [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url' },
          },
        },
      },
    })
    .start()
    .completed();
});
