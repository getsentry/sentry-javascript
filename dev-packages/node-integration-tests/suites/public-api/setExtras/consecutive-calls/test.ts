import { TestEnv, assertSentryEvent } from '../../../../utils';

test('should set extras from multiple consecutive calls', async () => {
  const env = await TestEnv.init(__dirname);
  const envelope = await env.getEnvelopeRequest();

  assertSentryEvent(envelope[2], {
    message: 'consecutive_calls',
    extra: { extra: [], Infinity: 2, null: 0, obj: { foo: ['bar', 'baz', 1] } },
  });
});
