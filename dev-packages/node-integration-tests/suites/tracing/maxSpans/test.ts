import type { SpanJSON } from '@sentry/core';
import { expect, test } from 'vitest';
import { createRunner } from '../../../utils/runner';

test('it limits spans to 1000', async () => {
  const expectedSpans: SpanJSON[] = [];
  for (let i = 0; i < 1000; i++) {
    expectedSpans.push(expect.objectContaining({ description: `child ${i}` }));
  }

  await createRunner(__dirname, 'scenario.ts')
    .expect({
      transaction: {
        transaction: 'parent',
        spans: expectedSpans,
      },
    })
    .start()
    .completed();
});
