import { afterAll, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('should work inside catch block', async () => {
  await createRunner(__dirname, 'scenario.ts')
    .expect({
      event: {
        exception: {
          values: [
            {
              type: 'Error',
              value: 'catched_error',
              mechanism: {
                type: 'generic',
                handled: true,
              },
              stacktrace: {
                frames: expect.arrayContaining([
                  expect.objectContaining({
                    context_line: "  throw new Error('catched_error');",
                    pre_context: [
                      "  release: '1.0',",
                      '  transport: loggingTransport,',
                      '});',
                      '',
                      'setupOtel(client);',
                      '',
                      'try {',
                    ],
                    post_context: ['} catch (err) {', '  Sentry.captureException(err);', '}'],
                  }),
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
