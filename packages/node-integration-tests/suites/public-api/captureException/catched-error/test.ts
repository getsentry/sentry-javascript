import { assertSentryEvent, TestEnv } from '../../../../utils';

test('should work inside catch block', async () => {
  const env = await TestEnv.init(__dirname);
  const event = await env.getEnvelopeRequest();

  assertSentryEvent(event[2], {
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
                  '',
                  'Sentry.init({',
                  "  dsn: 'https://public@dsn.ingest.sentry.io/1337',",
                  "  release: '1.0',",
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
  });
});
