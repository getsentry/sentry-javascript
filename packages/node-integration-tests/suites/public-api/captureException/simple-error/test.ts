import { assertSentryEvent, getMultipleEnvelopeRequest, runServer } from '../../../../utils';

test('should capture a simple error with message', async () => {
  const config = await runServer(__dirname);
  const envelopes = await getMultipleEnvelopeRequest(config, 2);
  const errorEnvelope = envelopes[1];

  assertSentryEvent(errorEnvelope[2], {
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
