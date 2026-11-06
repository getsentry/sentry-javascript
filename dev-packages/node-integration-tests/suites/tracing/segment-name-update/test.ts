import { afterAll, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('sends the final segment span name on child spans that ended before the segment span was renamed', async () => {
  await createRunner(__dirname, 'scenario.ts')
    .expect({
      span: container => {
        const segmentNames = Object.fromEntries(
          container.items.map(span => [span.name, span.attributes?.['sentry.segment.name']?.value]),
        );

        expect(segmentNames).toEqual({
          'early child': 'GET /users/:id',
          'late child': 'GET /users/:id',
          'GET /users/:id': 'GET /users/:id',
        });
      },
    })
    .unordered()
    .start()
    .completed();
});
