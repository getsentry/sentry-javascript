import { assertSentryEvent, getEnvelopeRequest, runServer } from '../../../../utils';

test('should capture a simple error with message', async () => {
  const config = await runServer(__dirname);
  const events = await getEnvelopeRequest(config);

  assertSentryEvent(events[2], {
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
