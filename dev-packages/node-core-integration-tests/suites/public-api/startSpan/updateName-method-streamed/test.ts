import { SEMANTIC_ATTRIBUTE_SENTRY_SOURCE } from '@sentry/node-core';
import { afterAll, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('updates the span name when calling `span.updateName` (streamed)', async () => {
  await createRunner(__dirname, 'scenario.ts')
    .expect({
      span: {
        items: [
          {
            name: 'new name',
            is_segment: true,
            attributes: {
              [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: { type: 'string', value: 'url' },
            },
          },
        ],
      },
    })
    .start()
    .completed();
});
