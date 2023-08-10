import { assertSentryTransaction, TestEnv } from '../../../../utils';

test('should auto-instrument `mysql` package.', async () => {
  const env = await TestEnv.init(__dirname);
  const envelope = await env.getEnvelopeRequest({ envelopeType: 'transaction' });

  expect(envelope).toHaveLength(3);

  assertSentryTransaction(envelope[2], {
    transaction: 'Test Transaction',
    spans: [
      {
        description: 'SELECT 1 + 1 AS solution',
        op: 'db',
        data: {
          'db.system': 'mysql',
          'db.user': 'root',
          'server.address': expect.any(String),
          'server.port': expect.any(Number),
        },
      },

      {
        description: 'SELECT NOW()',
        op: 'db',
        data: {
          'db.system': 'mysql',
          'db.user': 'root',
          'server.address': expect.any(String),
          'server.port': expect.any(Number),
        },
      },
    ],
  });
});
