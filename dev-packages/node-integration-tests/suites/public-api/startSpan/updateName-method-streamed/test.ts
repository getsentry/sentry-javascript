import { SENTRY_SEGMENT_NAME_SOURCE } from '@sentry/conventions/attributes';
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
              [SENTRY_SEGMENT_NAME_SOURCE]: { type: 'string', value: 'custom' },
            },
          },
        ],
      },
    })
    .start()
    .completed();
});
