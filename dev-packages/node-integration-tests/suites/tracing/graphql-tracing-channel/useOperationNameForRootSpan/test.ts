import { afterAll } from 'vitest';
import { conditionalTest } from '../../../../utils';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';

// graphql 17 requires Node >= 22, so this suite is skipped on older Node.
conditionalTest({ min: 22 })('GraphQL tracing channel Test > useOperationNameForRootSpan', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(
    __dirname,
    'scenario-query.mjs',
    'instrument.mjs',
    (createTestRunner, test) => {
      test('renames the root span with a single operation', async () => {
        await createTestRunner()
          .expect({ transaction: { transaction: 'Test Transaction (query GetHello)' } })
          .start()
          .completed();
      });
    },
    { additionalDependencies: { graphql: '^17' } },
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario-multiple.mjs',
    'instrument.mjs',
    (createTestRunner, test) => {
      test('accumulates multiple operations on the root span name (sorted)', async () => {
        await createTestRunner()
          .expect({ transaction: { transaction: 'Test Transaction (query GetHello, query GetWorld)' } })
          .start()
          .completed();
      });
    },
    { additionalDependencies: { graphql: '^17' } },
  );

  createEsmAndCjsTests(
    __dirname,
    'scenario-disabled.mjs',
    'instrument-disabled.mjs',
    (createTestRunner, test) => {
      test('keeps the original root span name when useOperationNameForRootSpan is false', async () => {
        await createTestRunner()
          .expect({ transaction: { transaction: 'Test Transaction' } })
          .start()
          .completed();
      });
    },
    { additionalDependencies: { graphql: '^17' } },
  );
});
