import { TestEnv, assertSentryTransaction } from '../../../../utils';

test('should send a manually started transaction when @sentry/tracing is imported using unnamed import.', async () => {
  const env = await TestEnv.init(__dirname);
  const envelope = await env.getEnvelopeRequest({ envelopeType: 'transaction' });

  assertSentryTransaction(envelope[2], {
    transaction: 'test_transaction_1',
  });
});
