import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';

describe('GraphQL/Apollo Tests > static naming', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(
    __dirname,
    '../useOperationNameForRootSpan/scenario-query.mjs',
    'instrument.mjs',
    (createTestRunner, test) => {
      test('keeps operation and resolver names in transaction spans', async () => {
        await createTestRunner()
          .expect({ transaction: { transaction: 'Test Server Start' } })
          .expect({
            transaction: event => {
              expect(event.transaction).toBe('test span name (query GetHello)');
              const spans = event.spans?.filter(span => span.op === 'graphql');
              expect(spans?.map(span => span.description).sort()).toEqual([
                'graphql.parse',
                'graphql.resolve hello',
                'graphql.validate',
                'query GetHello',
              ]);
            },
          })
          .start()
          .completed();
      });
    },
  );

  createEsmAndCjsTests(
    __dirname,
    '../useOperationNameForRootSpan/scenario-multiple-operations.mjs',
    'instrument.mjs',
    (createTestRunner, test) => {
      test('sorts operation names in the transaction name', async () => {
        await createTestRunner()
          .expect({ transaction: { transaction: 'Test Server Start' } })
          .expect({ transaction: { transaction: 'test span name (query GetHello, query GetWorld)' } })
          .start()
          .completed();
      });
    },
  );

  createEsmAndCjsTests(
    __dirname,
    '../useOperationNameForRootSpan/scenario-multiple-operations-many.mjs',
    'instrument.mjs',
    (createTestRunner, test) => {
      test('truncates the transaction name after five operations', async () => {
        await createTestRunner()
          .expect({ transaction: { transaction: 'Test Server Start' } })
          .expect({
            transaction: {
              transaction:
                'test span name (query GetHello1, query GetHello2, query GetHello3, query GetHello4, query GetHello5, +4)',
            },
          })
          .start()
          .completed();
      });
    },
  );
});
