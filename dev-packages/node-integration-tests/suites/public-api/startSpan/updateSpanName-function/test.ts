import { SENTRY_SEGMENT_NAME_SOURCE } from '@sentry/conventions/attributes';
import { afterAll, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('updates the span name and source when calling `updateSpanName`', async () => {
  await createRunner(__dirname, 'scenario.ts')
    .expect({
      span: {
        items: [
          {
            name: 'new name',
            is_segment: true,
            span_id: expect.any(String),
            trace_id: expect.any(String),
            start_timestamp: expect.any(Number),
            end_timestamp: expect.any(Number),
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
