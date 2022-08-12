import { assertSentryEvent, getMultipleEnvelopeRequest, runServer } from '../../../../utils';

test('should normalize non-serializable extra', async () => {
  const config = await runServer(__dirname);
  const envelopes = await getMultipleEnvelopeRequest(config, 2);
  const errorEnvelope = envelopes[1];

  assertSentryEvent(errorEnvelope[2], {
    message: 'non_serializable',
    extra: {},
  });
});
