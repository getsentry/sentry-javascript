import { assertSentryTransaction, conditionalTest, TestEnv } from '../../../utils';

conditionalTest({ min: 12 })('Prisma ORM Integration', () => {
  test('should instrument Prisma client for tracing.', async () => {
    const env = await TestEnv.init(__dirname);
    const envelope = await env.getEnvelopeRequest({ envelopeType: 'transaction' });

    assertSentryTransaction(envelope[2], {
      transaction: 'Test Transaction',
      spans: [
        { description: 'User create', op: 'db.prisma' },
        { description: 'User findMany', op: 'db.prisma' },
        { description: 'User deleteMany', op: 'db.prisma' },
      ],
    });
  });
});
