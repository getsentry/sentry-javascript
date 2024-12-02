import { join } from 'path';
import { createRunner } from '../../utils/runner';

describe('ContextLines integration', () => {
  test('reads context lines from filenames with spaces', done => {
    expect.assertions(1);
    const instrumentPath = join(__dirname, 'instrument.mjs');

    createRunner(__dirname, 'scenario with space.mjs')
      .withFlags('--import', instrumentPath)
      .expect({
        event: {
          exception: {
            values: [
              {
                value: 'Test Error',
                stacktrace: {
                  frames: expect.arrayContaining([
                    {
                      filename: expect.stringMatching(/\/scenario with space.mjs$/),
                      context_line: "Sentry.captureException(new Error('Test Error'));",
                      pre_context: ["import * as Sentry from '@sentry/node';", ''],
                      post_context: ['', '// some more post context'],
                      colno: 25,
                      lineno: 3,
                      function: '?',
                      in_app: true,
                      module: 'scenario%20with%20space',
                    },
                  ]),
                },
              },
            ],
          },
        },
      })
      .start(done);
  });
});
