import { assertSentryEvent, filterEnvelopeItems, getMultipleEnvelopeRequest, runServer } from '../../../../utils';

test('should capture a simple error with message', async () => {
  const config = await runServer(__dirname);
  const events = filterEnvelopeItems(await getMultipleEnvelopeRequest(config, { count: 1 }));

  assertSentryEvent(events[0], {
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
