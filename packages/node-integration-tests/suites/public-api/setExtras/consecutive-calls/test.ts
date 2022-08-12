import { assertSentryEvent, getMultipleEnvelopeRequest, runServer } from '../../../../utils';

test('should set extras from multiple consecutive calls', async () => {
  const config = await runServer(__dirname);
  const envelopes = await getMultipleEnvelopeRequest(config, 2);
  const errorEnvelope = envelopes[1];

  assertSentryEvent(errorEnvelope[2], {
    message: 'consecutive_calls',
    extra: { extra: [], Infinity: 2, null: 0, obj: { foo: ['bar', 'baz', 1] } },
  });
});
