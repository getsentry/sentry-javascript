import { assertSentryTransaction, getEnvelopeRequest, runServer } from '../../../../utils';

test('should auto-instrument `mysql` package.', async () => {
  const url = await runServer(__dirname);
  const envelope = await getEnvelopeRequest(url);

  expect(envelope).toHaveLength(3);

  assertSentryTransaction(envelope[2], {
    transaction: 'Test Transaction',
    spans: [
      {
        description: 'SELECT 1 + 1 AS solution',
        op: 'db',
      },

      {
        description: 'SELECT NOW()',
        op: 'db',
      },
    ],
  });
});
