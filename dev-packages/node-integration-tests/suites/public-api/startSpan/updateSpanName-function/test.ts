import { SEMANTIC_ATTRIBUTE_SENTRY_SOURCE } from '@sentry/node';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('updates the span name and source when calling `updateSpanName`', done => {
  createRunner(__dirname, 'scenario.ts')
    .expect({
      transaction: {
        transaction: 'new name',
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
    .start(done);
});
