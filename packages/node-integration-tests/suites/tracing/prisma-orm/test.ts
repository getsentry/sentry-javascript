import { assertSentryTransaction, getEnvelopeRequest, runServer } from '../../../utils';

test('should instrument Prisma ORM client for tracing.', async () => {
  const url = await runServer(__dirname);
  const envelope = await getEnvelopeRequest(url);

  assertSentryTransaction(envelope[2], {
    transaction: 'Test Transaction',
    spans: [
      { description: 'Action: create, Model: User', op: 'prisma' },
      { description: 'Action: findMany, Model: User', op: 'prisma' },
      { description: 'Action: deleteMany, Model: User', op: 'prisma' },
    ],
  });
});
