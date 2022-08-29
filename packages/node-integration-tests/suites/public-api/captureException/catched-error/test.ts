import { assertSentryEvent, getMultipleEnvelopeRequest, runServer } from '../../../../utils';

test('should work inside catch block', async () => {
  const config = await runServer(__dirname);
  const events = await getMultipleEnvelopeRequest(config, { count: 1 });

  assertSentryEvent(events[0][2], {
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
