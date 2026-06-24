import { SEMANTIC_ATTRIBUTE_SENTRY_SOURCE } from '@sentry/node';
import { afterAll, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('updates the span name when calling `span.updateName`', async () => {
  await createRunner(__dirname, 'scenario.ts')
    .expect({
      transaction: {
        transaction: 'new name',
        // `updateName` marks the name as explicitly chosen, so the source becomes `custom`,
        // overriding the `url` source set at span start (a stale `url` no longer describes the name).
        transaction_info: { source: 'custom' },
        contexts: {
          trace: {
            span_id: expect.any(String),
            trace_id: expect.any(String),
            data: { [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'custom' },
          },
        },
      },
    })
    .start()
    .completed();
});
