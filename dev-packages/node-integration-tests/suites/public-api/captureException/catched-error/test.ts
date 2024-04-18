import { cleanupChildProcesses, createRunner } from '../../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('should work inside catch block', done => {
  createRunner(__dirname, 'scenario.ts')
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
                      'Sentry.init({',
                      "  dsn: 'https://public@dsn.ingest.sentry.io/1337',",
                      "  release: '1.0',",
                      '  transport: loggingTransport,',
                      '});',
                      '',
                      'try {',
                    ],
                    post_context: ['} catch (err) {', '  Sentry.captureException(err);', '}', ''],
                  }),
                ]),
              },
            },
          ],
        },
      },
    })
    .start(done);
});
