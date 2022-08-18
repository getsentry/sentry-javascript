import { assertSentryEvent, getEnvelopeRequest, runServer } from '../../../../utils';

test('should work inside catch block', async () => {
  const config = await runServer(__dirname);
  const event = await getEnvelopeRequest(config);

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
            frames: expect.any(Array),
          },
        },
      ],
    },
  });
});
