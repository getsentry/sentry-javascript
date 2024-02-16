import { TestEnv, assertSentryEvent } from '../../../../utils';

test('should capture a simple error with message', async () => {
  const env = await TestEnv.init(__dirname);
  const envelope = await env.getEnvelopeRequest();

  assertSentryEvent(envelope[2], {
    exception: {
      values: [
        {
          type: 'Error',
          value: 'test_simple_error',
          mechanism: {
            type: 'generic',
            handled: true,
          },
          stacktrace: {
            frames: expect.any(Array),
          },
        },
      ],
    },
  });
});
