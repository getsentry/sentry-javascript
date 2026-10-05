import { afterAll, expect } from 'vitest';
import { expectGraphqlTrace } from '../../graphql-test-utils';
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
      name: 'GraphQL resolve',
      attributes: expect.objectContaining({
        'sentry.op': { value: 'graphql', type: 'string' },
        'sentry.origin': { value: 'auto.graphql.diagnostic_channel', type: 'string' },
        'graphql.field.name': { value: fieldName, type: 'string' },
        'graphql.field.path': { value: path, type: 'string' },
        'graphql.parent.name': { value: parentName, type: 'string' },
      }),
    });

  const EXPECTED_TRACE = {
    segment: {
      name: 'Test Transaction',
      attributes: { 'sentry.graphql.operation': { value: ['query', 'query GetUser'], type: 'array' } },
    },
    children: expect.arrayContaining([
      expect.objectContaining({
        name: 'GraphQL query',
        attributes: expect.objectContaining({
          'sentry.op': { value: 'graphql', type: 'string' },
          'graphql.document': { value: '{ hello }', type: 'string' },
        }),
      }),
      expect.objectContaining({
        name: 'GraphQL query',
        attributes: expect.objectContaining({
          'sentry.op': { value: 'graphql', type: 'string' },
          'graphql.operation.name': { value: 'GetUser', type: 'string' },
        }),
      }),
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
        await createTestRunner()
          .unordered()
          .expect({
            span: expectGraphqlTrace('Test Transaction', (segment, children) => {
              expect({ segment, children }).toMatchObject(EXPECTED_TRACE);
            }),
          })
          .start()
          .completed();
      });

      test('skips the default property resolver (trivial resolve) by default', async () => {
        await createTestRunner()
          .unordered()
          .expect({
            span: expectGraphqlTrace('Test Transaction', (_segment, spans) => {
              // `user.name` uses graphql's default property resolver, so no span is emitted for it.
              expect(spans.find(span => span.attributes['graphql.field.path']?.value === 'user.name')).toBeUndefined();
              // ...but the user-defined resolvers do produce spans.
              expect(spans.find(span => span.attributes['graphql.field.path']?.value === 'user')).toBeDefined();
            }),
          })
          .start()
          .completed();
      });
    },
    { additionalDependencies: { graphql: '^17' } },
  );

  // With `ignoreTrivialResolveSpans: false`, graphql's default property resolver is no longer skipped,
  // so the `user.name` field (which has no explicit resolver) also gets a `graphql.resolve` span.
  createEsmAndCjsTests(
    __dirname,
    'scenario.mjs',
    'instrument-trivial.mjs',
    (createTestRunner, test) => {
      test('emits a span for the trivial default resolver when ignoreTrivialResolveSpans is false', async () => {
        await createTestRunner()
          .unordered()
          .expect({
            span: expectGraphqlTrace('Test Transaction', (_segment, spans) => {
              expect(spans.find(span => span.attributes['graphql.field.path']?.value === 'user.name')).toBeDefined();
            }),
          })
          .start()
          .completed();
      });
    },
    { additionalDependencies: { graphql: '^17' } },
  );
});
