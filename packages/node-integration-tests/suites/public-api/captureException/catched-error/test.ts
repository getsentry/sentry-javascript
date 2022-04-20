import { assertSentryEvent, getMultipleEnvelopeRequest, runServer } from '../../../../utils';

test('should work inside catch block', async () => {
  const url = await runServer(__dirname);
  const envelopes = await getMultipleEnvelopeRequest(url, 2);
  const errorEnvelope = envelopes[1];

  assertSentryEvent(errorEnvelope[2], {
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
            frames: expect.any(Array),
          },
        },
      ],
    },
  });
});
