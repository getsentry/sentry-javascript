import { assertSentryTransaction, getEnvelopeRequest, runServer } from '../../../../utils';

test('should send a manually started transaction when @sentry/tracing is imported using unnamed import.', async () => {
  const config = await runServer(__dirname);
  const envelope = await getEnvelopeRequest(config);

  expect(envelope).toHaveLength(3);

  assertSentryTransaction(envelope[2], {
    transaction: 'test_transaction_1',
  });
});
