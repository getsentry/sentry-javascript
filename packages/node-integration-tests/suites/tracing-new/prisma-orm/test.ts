import { TestEnv, assertSentryTransaction, conditionalTest } from '../../../utils';

conditionalTest({ min: 12 })('Prisma ORM Integration', () => {
  test('should instrument Prisma client for tracing.', async () => {
    const env = await TestEnv.init(__dirname);
    const envelope = await env.getEnvelopeRequest({ envelopeType: 'transaction' });

    assertSentryTransaction(envelope[2], {
      transaction: 'Test Transaction',
      spans: [
        {
          description: 'User create',
          op: 'db.prisma',
          data: { 'db.system': 'postgresql', 'db.operation': 'create', 'db.prisma.version': '3.12.0' },
        },
        {
          description: 'User findMany',
          op: 'db.prisma',
          data: { 'db.system': 'postgresql', 'db.operation': 'findMany', 'db.prisma.version': '3.12.0' },
        },
        {
          description: 'User deleteMany',
          op: 'db.prisma',
          data: { 'db.system': 'postgresql', 'db.operation': 'deleteMany', 'db.prisma.version': '3.12.0' },
        },
      ],
    });
  });
});
