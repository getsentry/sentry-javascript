import { assertSentryEvent, getEnvelopeRequest, runServer } from '../../../../utils';

test('should capture an empty object', async () => {
  const config = await runServer(__dirname);
  const events = await getEnvelopeRequest(config);

  assertSentryEvent(events[2], {
    exception: {
      values: [
        {
          type: 'Error',
          value: 'Non-Error exception captured with keys: [object has no keys]',
          mechanism: {
            type: 'generic',
            handled: true,
          },
        },
      ],
    },
  });
});
