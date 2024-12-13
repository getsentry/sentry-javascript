import type { SpanJSON } from '@sentry/core';
import { createRunner } from '../../../utils/runner';

test('it limits spans to 1000', done => {
  const expectedSpans: SpanJSON[] = [];
  for (let i = 0; i < 1000; i++) {
    expectedSpans.push(expect.objectContaining({ description: `child ${i}` }));
  }

  createRunner(__dirname, 'scenario.ts')
    .expect({
      transaction: {
        transaction: 'parent',
        spans: expectedSpans,
      },
    })
    .start(done);
});
