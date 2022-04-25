import { assertSentryEvent, getMultipleEnvelopeRequest, runServer } from '../../../../utils';

test('should capture a simple message string', async () => {
  const url = await runServer(__dirname);
  const envelopes = await getMultipleEnvelopeRequest(url, 2);
  const errorEnvelope = envelopes[1];

  assertSentryEvent(errorEnvelope[2], {
    message: 'Message',
    level: 'info',
  });
});
