import { afterAll, expect } from 'vitest';
import { conditionalTest } from '../../../../utils';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';

// With `ignoreResolveSpans: false`, the channel path also subscribes `graphql:resolve` and emits a
// span per non-trivial field resolver. `ignoreTrivialResolveSpans` defaults to true, so graphql's
// default property resolver (the `name` field) is skipped. graphql 17 requires Node >= 22.
conditionalTest({ min: 22 })('GraphQL tracing channel Test > resolve spans', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  const expectedResolveSpan = (path: string, fieldName: string, parentName: string) =>
    expect.objectContaining({
      description: `graphql.resolve ${path}`,
      op: 'graphql',
      origin: 'auto.graphql.diagnostic_channel',
      data: expect.objectContaining({
        'graphql.field.name': fieldName,
        'graphql.field.path': path,
        'graphql.parent.name': parentName,
      }),
    });

  const EXPECTED_TRANSACTION = {
    transaction: 'Test Transaction',
    spans: expect.arrayContaining([
      expect.objectContaining({ description: 'query', op: 'graphql' }),
      expect.objectContaining({ description: 'query GetUser', op: 'graphql' }),
      expectedResolveSpan('hello', 'hello', 'Query'),
      expectedResolveSpan('user', 'user', 'Query'),
    ]),
  };

  createEsmAndCjsTests(
    __dirname,
    'scenario.mjs',
    'instrument.mjs',
    (createTestRunner, test) => {
      test('emits resolver spans when ignoreResolveSpans is false', async () => {
        await createTestRunner().expect({ transaction: EXPECTED_TRANSACTION }).start().completed();
      });

      test('skips the default property resolver (trivial resolve) by default', async () => {
        await createTestRunner()
          .expect({
            transaction: event => {
              const spans = event.spans || [];
              // `user.name` uses graphql's default property resolver, so no span is emitted for it.
              expect(spans.find(span => span.description === 'graphql.resolve user.name')).toBeUndefined();
              // ...but the user-defined resolvers do produce spans.
              expect(spans.find(span => span.description === 'graphql.resolve user')).toBeDefined();
            },
          })
          .start()
          .completed();
      });
    },
    { additionalDependencies: { graphql: '^17' } },
  );
});
