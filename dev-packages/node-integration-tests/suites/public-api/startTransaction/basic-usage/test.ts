import { TestEnv, assertSentryTransaction } from '../../../../utils';

test('should send a manually started root span', async () => {
  const env = await TestEnv.init(__dirname);
  const envelope = await env.getEnvelopeRequest({ envelopeType: 'transaction' });

  assertSentryTransaction(envelope[2], {
    transaction: 'test_span',
  });
});
