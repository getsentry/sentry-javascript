import { afterAll, describe, expect } from 'vitest';
import { supports } from '../../../../utils';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';

// graphql 17 requires Node >= 22, so this suite is skipped on older Node.
describe.runIf(supports({ min: 22 }))('GraphQL tracing channel Test > useOperationNameForRootSpan', () => {
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
          .expect({
            span: container => {
              const segment = container.items.find(span => span.is_segment);
              expect(segment?.name).toBe('Test Transaction');

              expect(segment?.attributes['sentry.graphql.operation']).toEqual({
                value: 'query GetHello',
                type: 'string',
              });
            },
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
          .expect({
            span: container => {
              const segment = container.items.find(span => span.is_segment);
              expect(segment?.name).toBe('Test Transaction');

              expect(segment?.attributes['sentry.graphql.operation']).toEqual({
                value: ['query GetWorld', 'query GetHello'],
                type: 'array',
              });
            },
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
          .expect({
            span: container => {
              const segment = container.items.find(span => span.is_segment);
              expect(segment?.name).toBe('Test Transaction');

              expect(segment?.attributes['sentry.graphql.operation']).toBeUndefined();
            },
          })
          .start()
          .completed();
      });
    },
    { additionalDependencies: { graphql: '^17' } },
  );
});
