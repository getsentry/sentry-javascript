import { afterAll, expect } from 'vitest';
import { conditionalTest } from '../../../utils';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

// graphql >= 17 publishes its operations via `node:diagnostics_channel`, so the SDK subscribes to
// those channels (`subscribeGraphqlDiagnosticChannels`) instead of the vendored OTel patcher. This
// suite pins `^17` and asserts the diagnostics-channel path: graphql semconv attributes, redacted
// document text, span relationships, and that the legacy OTel path does NOT also fire (no double
// instrumentation). graphql 17 requires Node >= 22, so this suite is skipped on older Node.
conditionalTest({ min: 22 })('GraphQL tracing channel Test', () => {
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
              expect(segment).toBeDefined();
              const children = container.items.filter(span => !span.is_segment);

              expect(segment?.name).toBe('Test Transaction');
              expect(segment?.attributes['sentry.graphql.operation']).toEqual({
                value: ['query', 'query GetUser', 'mutation Login', 'query Boom'],
                type: 'array',
              });
              const parseSpan = children.find(span => span.attributes['graphql.processing.type']?.value === 'parse');
              expect(parseSpan).toBeDefined();
              expect(parseSpan?.name).toBe('GraphQL parse');
              expect(parseSpan?.attributes['sentry.op']).toEqual({ value: 'graphql', type: 'string' });
              const validateSpan = children.find(
                span => span.attributes['graphql.processing.type']?.value === 'validate',
              );
              expect(validateSpan).toBeDefined();
              expect(validateSpan?.name).toBe('GraphQL validate');
              expect(validateSpan?.attributes['sentry.op']).toEqual({ value: 'graphql', type: 'string' });
              const executeSpan = children.find(
                span =>
                  span.attributes['graphql.processing.type']?.value === 'execute' &&
                  span.attributes['graphql.operation.name'] === undefined,
              );
              expect(executeSpan).toBeDefined();
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
              expect(getUserSpan).toBeDefined();
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
              expect(loginSpan).toBeDefined();
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

      test('does not double-instrument: the vendored OTel graphql patcher does not fire on 17', async () => {
        await createTestRunner()
          .expect({
            span: container => {
              const segment = container.items.find(span => span.is_segment);
              expect(segment).toBeDefined();
              expect(segment?.name).toBe('Test Transaction');
              const spans = container.items.filter(span => !span.is_segment);

              // The vendored OTel path (origin `auto.graphql.graphql`) must be inactive on 17+.
              expect(
                spans.find(span => span.attributes['sentry.origin']?.value === 'auto.graphql.graphql'),
              ).toBeUndefined();
              // ...while the diagnostics-channel path is active.
              expect(
                spans.find(span => span.attributes['sentry.origin']?.value === 'auto.graphql.diagnostic_channel'),
              ).toBeDefined();
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
              expect(segment).toBeDefined();
              expect(segment?.name).toBe('Test Transaction');
              const spans = container.items.filter(span => !span.is_segment);

              const loginSpan = spans.find(
                span =>
                  span.attributes['graphql.processing.type']?.value === 'execute' &&
                  span.attributes['graphql.operation.name']?.value === 'Login',
              );
              expect(loginSpan).toBeDefined();
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
              expect(segment).toBeDefined();
              expect(segment?.name).toBe('Test Transaction');
              const spans = container.items.filter(span => !span.is_segment);

              const boomSpan = spans.find(
                span =>
                  span.attributes['graphql.processing.type']?.value === 'execute' &&
                  span.attributes['graphql.operation.name']?.value === 'Boom',
              );
              expect(boomSpan).toBeDefined();
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
              expect(segment).toBeDefined();
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
              expect(segment).toBeDefined();
              expect(segment?.name).toBe('Test Transaction');
              const spans = container.items.filter(span => !span.is_segment);

              const validateSpan = spans.find(span => span.attributes['graphql.processing.type']?.value === 'validate');
              expect(validateSpan).toBeDefined();
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
