import { afterAll, expect } from 'vitest';
import { expectGraphqlTrace } from '../graphql-test-utils';
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

  const expectedExecuteSpan = (operationType: string, extraAttributes: Record<string, unknown> = {}) =>
    expect.objectContaining({
      name: `GraphQL ${operationType}`,
      attributes: expect.objectContaining({
        'sentry.op': { value: 'graphql', type: 'string' },
        'sentry.origin': { value: 'auto.graphql.diagnostic_channel', type: 'string' },
        ...extraAttributes,
      }),
    });

  const EXPECTED_TRACE = {
    segment: {
      name: 'Test Transaction',
      attributes: {
        'sentry.graphql.operation': {
          value: ['query', 'query GetUser', 'mutation Login', 'query Boom'],
          type: 'array',
        },
      },
    },
    children: expect.arrayContaining([
      expect.objectContaining({
        name: 'GraphQL parse',
        attributes: expect.objectContaining({ 'sentry.op': { value: 'graphql', type: 'string' } }),
      }),
      expect.objectContaining({
        name: 'GraphQL validate',
        attributes: expect.objectContaining({ 'sentry.op': { value: 'graphql', type: 'string' } }),
      }),
      // Anonymous and named queries share the same low-cardinality span name.
      expectedExecuteSpan('query', {
        'graphql.operation.type': { value: 'query', type: 'string' },
        'graphql.document': { value: '{ hello }', type: 'string' },
      }),
      expectedExecuteSpan('query', {
        'graphql.operation.type': { value: 'query', type: 'string' },
        'graphql.operation.name': { value: 'GetUser', type: 'string' },
        // the inline `42` literal is redacted out of the document
        'graphql.document': { value: 'query GetUser { user(id: *) { name } }', type: 'string' },
      }),
      expectedExecuteSpan('mutation', {
        'graphql.operation.name': { value: 'Login', type: 'string' },
        'graphql.operation.type': { value: 'mutation', type: 'string' },
        // the inline email literal must be redacted to `"*"`, so the raw value can never leak
        'graphql.document': { value: 'mutation Login { login(email: "*") }', type: 'string' },
      }),
    ]),
  };

  createEsmAndCjsTests(
    __dirname,
    'scenario.mjs',
    'instrument.mjs',
    (createTestRunner, test) => {
      test('subscribes to graphql >= 17 diagnostics channels with graphql semconv attributes', async () => {
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

      test('does not double-instrument: the vendored OTel graphql patcher does not fire on 17', async () => {
        await createTestRunner()
          .unordered()
          .expect({
            span: expectGraphqlTrace('Test Transaction', (_segment, spans) => {
              // The vendored OTel path (origin `auto.graphql.graphql`) must be inactive on 17+.
              expect(
                spans.find(span => span.attributes['sentry.origin']?.value === 'auto.graphql.graphql'),
              ).toBeUndefined();
              // ...while the diagnostics-channel path is active.
              expect(
                spans.find(span => span.attributes['sentry.origin']?.value === 'auto.graphql.diagnostic_channel'),
              ).toBeDefined();
            }),
          })
          .start()
          .completed();
      });

      test('never leaks raw inline literal values into graphql.document', async () => {
        await createTestRunner()
          .unordered()
          .expect({
            span: expectGraphqlTrace('Test Transaction', (_segment, spans) => {
              for (const span of spans) {
                const document = span.attributes['graphql.document']?.value;
                if (typeof document === 'string') {
                  expect(document).not.toContain('secret@example.com');
                }
              }
            }),
          })
          .start()
          .completed();
      });

      test('flags the execute span as errored when a resolver throws', async () => {
        await createTestRunner()
          .unordered()
          .expect({
            span: expectGraphqlTrace('Test Transaction', (_segment, spans) => {
              const boomSpan = spans.find(
                span =>
                  span.attributes['graphql.processing.type']?.value === 'execute' &&
                  span.attributes['graphql.operation.name']?.value === 'Boom',
              );
              expect(boomSpan).toBeDefined();
              expect(boomSpan?.status).toBe('error');
              expect(boomSpan?.attributes['sentry.status.message']?.value).toBe('internal_error');
            }),
          })
          .start()
          .completed();
      });

      test('parents the execute span to the surrounding segment', async () => {
        await createTestRunner()
          .unordered()
          .expect({
            span: expectGraphqlTrace('Test Transaction', (segment, spans) => {
              const executeSpan = spans.find(
                span =>
                  span.attributes['graphql.processing.type']?.value === 'execute' &&
                  span.attributes['graphql.operation.name']?.value === 'GetUser',
              );
              expect(executeSpan).toBeDefined();
              expect(executeSpan?.parent_span_id).toBe(segment.span_id);
            }),
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
          .unordered()
          .expect({
            span: expectGraphqlTrace('Test Transaction', (_segment, spans) => {
              const validateSpan = spans.find(span => span.attributes['graphql.processing.type']?.value === 'validate');
              expect(validateSpan).toBeDefined();
              expect(validateSpan?.status).toBe('error');
              expect(validateSpan?.attributes['sentry.status.message']?.value).toBe('invalid_argument');
            }),
          })
          .start()
          .completed();
      });
    },
    { additionalDependencies: { graphql: '^17' } },
  );
});
