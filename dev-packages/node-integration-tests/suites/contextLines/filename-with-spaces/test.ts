import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('ContextLines integration - filename with spaces', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'scenario with space.mjs', 'instrument.mjs', (createRunner, test, mode) => {
    test('reads encoded context lines from filenames with spaces', async () => {
      expect.assertions(1);

      await createRunner()
        .expect({
          event: {
            exception: {
              values: [
                {
                  value: 'Test Error',
                  stacktrace: {
                    frames: expect.arrayContaining([
                      {
                        filename: expect.stringMatching(
                          mode === 'esm' ? /\/scenario with space.mjs$/ : /\/scenario with space.cjs$/,
                        ),
                        context_line: "Sentry.captureException(new Error('Test Error'));",
                        pre_context:
                          mode === 'esm'
                            ? ["import * as Sentry from '@sentry/node';", '']
                            : ["const Sentry = require('@sentry/node');", ''],
                        post_context: ['', '// some more post context'],
                        colno: 25,
                        lineno: 3,
                        function: mode === 'esm' ? '?' : 'Object.?',
                        in_app: true,
                        module: 'scenario with space',
                      },
                    ]),
                  },
                },
              ],
            },
          },
        })
        .start()
        .completed();
    });
  });
});
