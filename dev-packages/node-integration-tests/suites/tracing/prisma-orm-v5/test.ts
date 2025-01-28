import { createRunner } from '../../../utils/runner';

describe('Prisma ORM Tests', () => {
  test('CJS - should instrument PostgreSQL queries from Prisma ORM', done => {
    createRunner(__dirname, 'scenario.js')
      .expect({
        transaction: transaction => {
          expect(transaction.transaction).toBe('Test Transaction');
          const spans = transaction.spans || [];
          expect(spans.length).toBeGreaterThanOrEqual(5);

          expect(spans).toContainEqual(
            expect.objectContaining({
              data: {
                method: 'create',
                model: 'User',
                name: 'User.create',
                'sentry.origin': 'auto.db.otel.prisma',
              },
              description: 'prisma:client:operation',
              status: 'ok',
            }),
          );

          expect(spans).toContainEqual(
            expect.objectContaining({
              data: {
                'sentry.origin': 'auto.db.otel.prisma',
              },
              description: 'prisma:client:serialize',
              status: 'ok',
            }),
          );

          expect(spans).toContainEqual(
            expect.objectContaining({
              data: {
                'sentry.origin': 'auto.db.otel.prisma',
              },
              description: 'prisma:client:connect',
              status: 'ok',
            }),
          );
          expect(spans).toContainEqual(
            expect.objectContaining({
              data: {
                method: 'findMany',
                model: 'User',
                name: 'User.findMany',
                'sentry.origin': 'auto.db.otel.prisma',
              },
              description: 'prisma:client:operation',
              status: 'ok',
            }),
          );
          expect(spans).toContainEqual(
            expect.objectContaining({
              data: {
                'sentry.origin': 'auto.db.otel.prisma',
              },
              description: 'prisma:client:serialize',
              status: 'ok',
            }),
          );
        },
      })
      .start(done);
  });
});
