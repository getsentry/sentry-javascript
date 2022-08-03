import { assertSentryEvent, getMultipleEnvelopeRequest, runServer, filterEnvelopeItems } from '../../../../utils';

test('should capture an empty object', async () => {
  const url = await runServer(__dirname);
  const events = filterEnvelopeItems(await getMultipleEnvelopeRequest(url, 2));

  assertSentryEvent(events[0], {
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
