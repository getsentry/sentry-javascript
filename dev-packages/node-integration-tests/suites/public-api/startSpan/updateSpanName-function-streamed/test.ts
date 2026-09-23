import { SENTRY_SEGMENT_NAME_SOURCE } from '@sentry/conventions/attributes';
import { afterAll, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('updates the span name and source when calling `updateSpanName` (streamed)', async () => {
  await createRunner(__dirname, 'scenario.ts')
    .expect({
      span: {
        items: [
          {
            name: 'new name',
            is_segment: true,
            attributes: {
              [SENTRY_SEGMENT_NAME_SOURCE]: { type: 'string', value: 'custom' },
            },
          },
        ],
      },
    })
    .start()
    .completed();
});
