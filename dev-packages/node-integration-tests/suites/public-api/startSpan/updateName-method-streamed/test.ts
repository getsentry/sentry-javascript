import { SEMANTIC_ATTRIBUTE_SENTRY_SOURCE } from '@sentry/node';
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
              // `updateName` marks the name as explicitly chosen, so the source becomes `custom`,
              // overriding the `url` source set at span start (a stale `url` no longer describes the name).
              [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: { type: 'string', value: 'custom' },
            },
          },
        ],
      },
    })
    .start()
    .completed();
});
