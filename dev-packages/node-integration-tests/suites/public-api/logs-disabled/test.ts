import { afterAll, describe, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

describe('logs disabled', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  // With `enableLogs: false` the log is dropped at capture time, so it never reaches
  // the transport. The sentinel error is the only envelope we expect — if a log
  // envelope were emitted, it would arrive before the error and fail the assertion.
  test('does not capture logs when enableLogs is disabled', async () => {
    const runner = createRunner(__dirname, 'subject.ts')
      .expect({
        event: {
          exception: {
            values: [
              {
                type: 'Error',
                value: 'sentinel_error',
              },
            ],
          },
        },
      })
      .start();

    await runner.completed();
  });
});
