import { assertSentryEvent, TestEnv } from '../../../utils/index';

test('should capture and send Express controller error.', async () => {
  const env = await TestEnv.init(__dirname, `${__dirname}/server.ts`);
  const event = await env.getEnvelopeRequest({ url: `${env.url}/express` });

  expect((event[2] as any).exception.values[0].stacktrace.frames.length).toBeGreaterThan(0);

  assertSentryEvent(event[2] as any, {
    exception: {
      values: [
        {
          mechanism: {
            type: 'middleware',
            handled: false,
          },
          type: 'Error',
          value: 'test_error',
        },
      ],
    },
  });
});
