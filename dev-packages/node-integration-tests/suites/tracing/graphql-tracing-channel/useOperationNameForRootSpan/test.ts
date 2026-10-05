import { afterAll, expect } from 'vitest';
import { expectGraphqlTrace } from '../../graphql-test-utils';
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
      test('records a single operation without renaming the root span', async () => {
        await createTestRunner()
          .unordered()
          .expect({
            span: expectGraphqlTrace('Test Transaction', segment => {
              expect(segment.attributes['sentry.graphql.operation']?.value).toBe('query GetHello');
            }),
          })
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
      test('accumulates multiple operations without renaming the root span', async () => {
        await createTestRunner()
          .unordered()
          .expect({
            span: expectGraphqlTrace('Test Transaction', segment => {
              expect(segment.attributes['sentry.graphql.operation']?.value).toEqual([
                'query GetWorld',
                'query GetHello',
              ]);
            }),
          })
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
          .unordered()
          .expect({
            span: expectGraphqlTrace('Test Transaction', segment => {
              expect(segment.attributes['sentry.graphql.operation']).toBeUndefined();
            }),
          })
          .start()
          .completed();
      });
    },
    { additionalDependencies: { graphql: '^17' } },
  );
});
