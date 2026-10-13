import { afterAll, describe, expect } from 'vitest';
import { supports } from '../../../utils';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

// GraphQL 17 requires Node >= 22, so this suite is skipped on older Node.
describe.runIf(supports({ min: 22 }))('GraphQL tracing channel Test', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(
    __dirname,
    'scenario.mjs',
    'instrument.mjs',
    (createTestRunner, test) => {
      test('subscribes to graphql >= 17 diagnostics channels with graphql semconv attributes', async () => {
        await createTestRunner()
          .expect({
            span: container => {
              const segment = container.items.find(span => span.is_segment);
              const children = container.items.filter(span => !span.is_segment);

              expect(segment?.name).toBe('Test Transaction');
              expect(segment?.attributes['sentry.graphql.operation']).toEqual({
                value: ['query', 'query GetUser', 'mutation Login', 'query Boom'],
                type: 'array',
              });
              const parseSpan = children.find(span => span.attributes['graphql.processing.type']?.value === 'parse');
              expect(parseSpan?.name).toBe('GraphQL parse');
              expect(parseSpan?.attributes['sentry.op']).toEqual({ value: 'graphql', type: 'string' });
              const validateSpan = children.find(
                span => span.attributes['graphql.processing.type']?.value === 'validate',
              );
              expect(validateSpan?.name).toBe('GraphQL validate');
              expect(validateSpan?.attributes['sentry.op']).toEqual({ value: 'graphql', type: 'string' });
              const executeSpan = children.find(
                span =>
                  span.attributes['graphql.processing.type']?.value === 'execute' &&
                  span.attributes['graphql.operation.name'] === undefined,
              );
              expect(executeSpan?.name).toBe('GraphQL query');
              expect(executeSpan?.attributes['sentry.op']).toEqual({ value: 'graphql', type: 'string' });
              expect(executeSpan?.attributes['sentry.origin']).toEqual({
                value: 'auto.graphql.diagnostic_channel',
                type: 'string',
              });
              expect(executeSpan?.attributes['graphql.operation.type']).toEqual({ value: 'query', type: 'string' });
              expect(executeSpan?.attributes['graphql.document']).toEqual({ value: '{ hello }', type: 'string' });
              const getUserSpan = children.find(
                span =>
                  span.attributes['graphql.processing.type']?.value === 'execute' &&
                  span.attributes['graphql.operation.name']?.value === 'GetUser',
              );
              expect(getUserSpan?.name).toBe('GraphQL query');
              expect(getUserSpan?.attributes['sentry.op']).toEqual({ value: 'graphql', type: 'string' });
              expect(getUserSpan?.attributes['sentry.origin']).toEqual({
                value: 'auto.graphql.diagnostic_channel',
                type: 'string',
              });
              expect(getUserSpan?.attributes['graphql.operation.type']).toEqual({ value: 'query', type: 'string' });
              expect(getUserSpan?.attributes['graphql.operation.name']).toEqual({ value: 'GetUser', type: 'string' });
              expect(getUserSpan?.attributes['graphql.document']).toEqual({
                value: 'query GetUser { user(id: *) { name } }',
                type: 'string',
              });
              const loginSpan = children.find(
                span =>
                  span.attributes['graphql.processing.type']?.value === 'execute' &&
                  span.attributes['graphql.operation.name']?.value === 'Login',
              );
              expect(loginSpan?.name).toBe('GraphQL mutation');
              expect(loginSpan?.attributes['sentry.op']).toEqual({ value: 'graphql', type: 'string' });
              expect(loginSpan?.attributes['sentry.origin']).toEqual({
                value: 'auto.graphql.diagnostic_channel',
                type: 'string',
              });
              expect(loginSpan?.attributes['graphql.operation.name']).toEqual({ value: 'Login', type: 'string' });
              expect(loginSpan?.attributes['graphql.operation.type']).toEqual({ value: 'mutation', type: 'string' });
              expect(loginSpan?.attributes['graphql.document']).toEqual({
                value: 'mutation Login { login(email: "*") }',
                type: 'string',
              });
            },
          })
          .start()
          .completed();
      });

      test('never leaks raw inline literal values into graphql.document', async () => {
        await createTestRunner()
          .expect({
            span: container => {
              const segment = container.items.find(span => span.is_segment);
              expect(segment?.name).toBe('Test Transaction');
              const spans = container.items.filter(span => !span.is_segment);

              const loginSpan = spans.find(
                span =>
                  span.attributes['graphql.processing.type']?.value === 'execute' &&
                  span.attributes['graphql.operation.name']?.value === 'Login',
              );
              expect(loginSpan?.attributes['graphql.document']).toEqual({
                value: 'mutation Login { login(email: "*") }',
                type: 'string',
              });
              const documents = spans.map(span => span.attributes['graphql.document']?.value);
              expect(documents.join('\n')).not.toContain('secret@example.com');
            },
          })
          .start()
          .completed();
      });

      test('flags the execute span as errored when a resolver throws', async () => {
        await createTestRunner()
          .expect({
            span: container => {
              const segment = container.items.find(span => span.is_segment);
              expect(segment?.name).toBe('Test Transaction');
              const spans = container.items.filter(span => !span.is_segment);

              const boomSpan = spans.find(
                span =>
                  span.attributes['graphql.processing.type']?.value === 'execute' &&
                  span.attributes['graphql.operation.name']?.value === 'Boom',
              );
              expect(boomSpan?.status).toBe('error');
              expect(boomSpan?.attributes['sentry.status.message']?.value).toBe('internal_error');
            },
          })
          .start()
          .completed();
      });

      test('parents the execute span to the surrounding segment', async () => {
        await createTestRunner()
          .expect({
            span: container => {
              const segment = container.items.find(span => span.is_segment);
              expect(segment?.name).toBe('Test Transaction');
              const spans = container.items.filter(span => !span.is_segment);

              const executeSpan = spans.find(
                span =>
                  span.attributes['graphql.processing.type']?.value === 'execute' &&
                  span.attributes['graphql.operation.name']?.value === 'GetUser',
              );
              expect(executeSpan).toBeDefined();
              expect(executeSpan?.parent_span_id).toBe(segment?.span_id);
            },
          })
          .start()
          .completed();
      });
    },
    { additionalDependencies: { graphql: '^17' } },
  );

  // A document that references an unknown field passes `graphql.parse` but fails `graphql.validate`;
  // validation returns errors without throwing, so the validate span must be flagged errored.
  createEsmAndCjsTests(
    __dirname,
    'scenario-invalid.mjs',
    'instrument.mjs',
    (createTestRunner, test) => {
      test('flags the validate span as errored for an invalid document', async () => {
        await createTestRunner()
          .expect({
            span: container => {
              const segment = container.items.find(span => span.is_segment);
              expect(segment?.name).toBe('Test Transaction');
              const spans = container.items.filter(span => !span.is_segment);

              const validateSpan = spans.find(span => span.attributes['graphql.processing.type']?.value === 'validate');
              expect(validateSpan?.status).toBe('error');
              expect(validateSpan?.attributes['sentry.status.message']?.value).toBe('invalid_argument');
            },
          })
          .start()
          .completed();
      });
    },
    { additionalDependencies: { graphql: '^17' } },
  );
});
