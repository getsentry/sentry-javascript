import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('should send manually started parallel root spans outside of root context with parentSpanId', done => {
  createRunner(__dirname, 'scenario.ts')
    .expect({
      transaction: {
        transaction: 'test_span_1',
        contexts: {
          trace: {
            span_id: expect.stringMatching(/[a-f0-9]{16}/),
            parent_span_id: '1234567890123456',
            trace_id: '12345678901234567890123456789012',
          },
        },
      },
    })
    .expect({
      transaction: {
        transaction: 'test_span_2',
        contexts: {
          trace: {
            span_id: expect.stringMatching(/[a-f0-9]{16}/),
            parent_span_id: '1234567890123456',
            trace_id: '12345678901234567890123456789012',
          },
        },
      },
    })
    .start(done);
});
