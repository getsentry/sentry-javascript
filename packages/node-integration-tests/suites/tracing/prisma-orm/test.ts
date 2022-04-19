import { assertSentryTransaction, conditionalTest, getEnvelopeRequest, runServer } from '../../../utils';

conditionalTest({ min: 12 })('Prisma ORM Integration', () => {
  test('should instrument Prisma client for tracing.', async () => {
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
});
