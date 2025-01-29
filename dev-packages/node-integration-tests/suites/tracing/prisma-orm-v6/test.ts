import { conditionalTest } from '../../../utils';
import { createRunner } from '../../../utils/runner';

conditionalTest({ min: 16 })('Prisma ORM Tests', () => {
  test('CJS - should instrument PostgreSQL queries from Prisma ORM', done => {
    createRunner(__dirname, 'scenario.js')
      .expect({
        transaction: transaction => {
          expect(transaction.transaction).toBe('Test Transaction');

          const spans = transaction.spans || [];
          expect(spans).toHaveLength(0);
        },
      })
      .start(done);
  });
});
