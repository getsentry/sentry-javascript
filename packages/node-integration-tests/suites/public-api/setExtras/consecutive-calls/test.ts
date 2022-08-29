import { assertSentryEvent, getEnvelopeRequest, runServer } from '../../../../utils';

test('should set extras from multiple consecutive calls', async () => {
  const config = await runServer(__dirname);
  const envelopes = await getEnvelopeRequest(config);

  assertSentryEvent(envelopes[2], {
    message: 'consecutive_calls',
    extra: { extra: [], Infinity: 2, null: 0, obj: { foo: ['bar', 'baz', 1] } },
  });
});
