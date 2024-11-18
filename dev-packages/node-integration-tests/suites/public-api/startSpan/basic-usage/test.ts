import { SEMANTIC_ATTRIBUTE_SENTRY_SOURCE } from '@sentry/node';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('sends a manually started root span with source custom', done => {
  createRunner(__dirname, 'scenario.ts')
    .expect({
      transaction: {
        transaction: 'test_span',
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

test("doesn't change the name for manually started spans even if attributes triggering inference are set", done => {
  createRunner(__dirname, 'scenario.ts')
    .expect({
      transaction: {
        transaction: 'test_span',
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
