import { assertSentryEvent, getMultipleEnvelopeRequest, runServer } from '../../../../utils';

test('should capture an empty object', async () => {
  const config = await runServer(__dirname);
  const envelopes = await getMultipleEnvelopeRequest(config, 2);
  const errorEnvelope = envelopes[1];

  assertSentryEvent(errorEnvelope[2], {
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
