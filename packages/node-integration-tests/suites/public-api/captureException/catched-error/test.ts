import { assertSentryEvent, getMultipleEnvelopeRequest, runServer, filterEnvelopes } from '../../../../utils';

test('should work inside catch block', async () => {
  const url = await runServer(__dirname);
  const events = filterEnvelopes(await getMultipleEnvelopeRequest(url, 2));

  assertSentryEvent(events[0], {
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
