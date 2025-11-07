import { afterAll, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('GrowthBook flags are added to active span attributes on span end', async () => {
  await createRunner(__dirname, 'scenario.ts')
    .expect({
      transaction: {
        contexts: {
          trace: {
            data: {
              'flag.evaluation.feat1': true,
              'flag.evaluation.feat2': false,
              'flag.evaluation.bool-feat': true,
              // string-feat should NOT be here since it's not boolean
            },
            op: 'function',
            origin: 'manual',
            status: 'ok',
            span_id: expect.stringMatching(/[a-f\d]{16}/),
            trace_id: expect.stringMatching(/[a-f\d]{32}/),
          },
        },
        spans: [],
        transaction: 'test-span',
        type: 'transaction',
      },
    })
    .start()
    .completed();
});
