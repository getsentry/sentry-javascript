import { afterAll, describe, expect } from 'vitest';
import { supports } from '../../../../utils';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';

// With `ignoreResolveSpans: false`, the channel path also subscribes `graphql:resolve` and emits a
// span per non-trivial field resolver. `ignoreTrivialResolveSpans` defaults to true, so graphql's
// default property resolver (the `name` field) is skipped. graphql 17 requires Node >= 22.
describe.runIf(supports({ min: 22 }))('GraphQL tracing channel Test > resolve spans', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(
    __dirname,
    'scenario.mjs',
    'instrument.mjs',
    (createTestRunner, test) => {
      test('records user-defined resolver spans and skips trivial resolvers by default', async () => {
        const runner = createTestRunner();
        const spansPromise = runner.collectStreamedSpans(
          spans =>
            spans.some(span => span.is_segment && span.name === 'Test Transaction') &&
            spans.filter(span => !span.is_segment && span.attributes['sentry.op']?.value === 'graphql').length >= 8,
        );
        await runner.start().completed();
        const container = { items: await spansPromise };
        {
          const segment = container.items.find(span => span.is_segment);
          const children = container.items.filter(span => !span.is_segment);

          expect(segment?.name).toBe('Test Transaction');
          expect(segment?.attributes['sentry.graphql.operation']).toEqual({
            value: ['query', 'query GetUser'],
            type: 'array',
          });
          const executeSpan = children.find(
            span =>
              span.attributes['graphql.processing.type']?.value === 'execute' &&
              span.attributes['graphql.operation.name'] === undefined,
          );
          expect(executeSpan?.name).toBe('GraphQL query');
          expect(executeSpan?.attributes['sentry.op']).toEqual({ value: 'graphql', type: 'string' });
          expect(executeSpan?.attributes['graphql.document']).toEqual({ value: '{ hello }', type: 'string' });
          const getUserSpan = children.find(
            span =>
              span.attributes['graphql.processing.type']?.value === 'execute' &&
              span.attributes['graphql.operation.name']?.value === 'GetUser',
          );
          expect(getUserSpan?.name).toBe('GraphQL query');
          expect(getUserSpan?.attributes['sentry.op']).toEqual({ value: 'graphql', type: 'string' });
          expect(getUserSpan?.attributes['graphql.operation.name']).toEqual({ value: 'GetUser', type: 'string' });
          const helloResolverSpan = children.find(
            span =>
              span.attributes['graphql.processing.type']?.value === 'resolve' &&
              span.attributes['graphql.field.path']?.value === 'hello',
          );
          expect(helloResolverSpan?.name).toBe('GraphQL resolve');
          expect(helloResolverSpan?.attributes['sentry.op']).toEqual({ value: 'graphql', type: 'string' });
          expect(helloResolverSpan?.attributes['sentry.origin']).toEqual({
            value: 'auto.graphql.graphql',
            type: 'string',
          });
          expect(helloResolverSpan?.attributes['graphql.field.name']).toEqual({ value: 'hello', type: 'string' });
          expect(helloResolverSpan?.attributes['graphql.field.path']).toEqual({ value: 'hello', type: 'string' });
          expect(helloResolverSpan?.attributes['graphql.parent.name']).toEqual({ value: 'Query', type: 'string' });
          const userResolverSpan = children.find(
            span =>
              span.attributes['graphql.processing.type']?.value === 'resolve' &&
              span.attributes['graphql.field.path']?.value === 'user',
          );
          expect(userResolverSpan?.name).toBe('GraphQL resolve');
          expect(userResolverSpan?.attributes['sentry.op']).toEqual({ value: 'graphql', type: 'string' });
          expect(userResolverSpan?.attributes['sentry.origin']).toEqual({
            value: 'auto.graphql.graphql',
            type: 'string',
          });
          expect(userResolverSpan?.attributes['graphql.field.name']).toEqual({ value: 'user', type: 'string' });
          expect(userResolverSpan?.attributes['graphql.field.path']).toEqual({ value: 'user', type: 'string' });
          expect(userResolverSpan?.attributes['graphql.parent.name']).toEqual({ value: 'Query', type: 'string' });
        }
        {
          const segment = container.items.find(span => span.is_segment);
          expect(segment?.name).toBe('Test Transaction');
          const spans = container.items.filter(span => !span.is_segment);

          // `user.name` uses graphql's default property resolver, so no span is emitted for it.
          expect(spans.find(span => span.attributes['graphql.field.path']?.value === 'user.name')).toBeUndefined();
          // ...but the user-defined resolvers do produce spans.
          expect(spans.find(span => span.attributes['graphql.field.path']?.value === 'user')).toBeDefined();
        }
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
          .expect({
            span: container => {
              const segment = container.items.find(span => span.is_segment);
              expect(segment?.name).toBe('Test Transaction');
              const spans = container.items.filter(span => !span.is_segment);

              expect(spans.find(span => span.attributes['graphql.field.path']?.value === 'user.name')).toBeDefined();
            },
          })
          .start()
          .completed();
      });
    },
    { additionalDependencies: { graphql: '^17' } },
  );
});
