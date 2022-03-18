import { assertSentryTransaction, getEnvelopeRequest, runServer } from '../../../utils';

test('should send a manually started transaction.', async () => {
  const url = await runServer(__dirname);
  const envelopeItem = await getEnvelopeRequest(url);

  assertSentryTransaction(envelopeItem, {
    transaction: 'test_transaction_1',
  });
});
