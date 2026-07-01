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

  const expectedExecuteSpan = (description: string, extraData: Record<string, unknown> = {}) =>
    expect.objectContaining({
      description,
      op: 'graphql',
      origin: 'auto.graphql.diagnostic_channel',
      data: expect.objectContaining(extraData),
    });

  const EXPECTED_TRANSACTION = {
    transaction: 'Test Transaction',
    spans: expect.arrayContaining([
      expect.objectContaining({ description: 'graphql.parse', op: 'graphql' }),
      expect.objectContaining({ description: 'graphql.validate', op: 'graphql' }),
      // anonymous query -> span named after the operation type only
      expectedExecuteSpan('query', { 'graphql.operation.type': 'query' }),
      expectedExecuteSpan('query GetUser', {
        'graphql.operation.type': 'query',
        'graphql.operation.name': 'GetUser',
        // the inline `42` literal is redacted out of the document
        'graphql.document': 'query GetUser { user(id: *) { name } }',
      }),
      expectedExecuteSpan('mutation Login', {
        'graphql.operation.type': 'mutation',
        // the inline email literal must be redacted to `"*"`, so the raw value can never leak
        'graphql.document': 'mutation Login { login(email: "*") }',
      }),
    ]),
  };

  createEsmAndCjsTests(
    __dirname,
    'scenario.mjs',
    'instrument.mjs',
    (createTestRunner, test) => {
      test('subscribes to graphql >= 17 diagnostics channels with graphql semconv attributes', async () => {
        await createTestRunner().expect({ transaction: EXPECTED_TRANSACTION }).start().completed();
      });

      test('does not double-instrument: the vendored OTel graphql patcher does not fire on 17', async () => {
        await createTestRunner()
          .expect({
            transaction: event => {
              const spans = event.spans || [];
              // The vendored OTel path (origin `auto.graphql.otel.graphql`) must be inactive on 17+.
              expect(spans.find(span => span.origin === 'auto.graphql.otel.graphql')).toBeUndefined();
              // ...while the diagnostics-channel path is active.
              expect(spans.find(span => span.origin === 'auto.graphql.diagnostic_channel')).toBeDefined();
            },
          })
          .start()
          .completed();
      });

      test('never leaks raw inline literal values into graphql.document', async () => {
        await createTestRunner()
          .expect({
            transaction: event => {
              const spans = event.spans || [];
              for (const span of spans) {
                const document = span.data?.['graphql.document'];
                if (typeof document === 'string') {
                  expect(document).not.toContain('secret@example.com');
                }
              }
            },
          })
          .start()
          .completed();
      });

      test('flags the execute span as errored when a resolver throws', async () => {
        await createTestRunner()
          .expect({
            transaction: event => {
              const spans = event.spans || [];
              const boomSpan = spans.find(span => span.description === 'query Boom');
              expect(boomSpan).toBeDefined();
              expect(boomSpan?.status).toBe('internal_error');
            },
          })
          .start()
          .completed();
      });

      test('parents the execute span to the surrounding transaction', async () => {
        await createTestRunner()
          .expect({
            transaction: event => {
              const spans = event.spans || [];
              const executeSpan = spans.find(span => span.description === 'query GetUser');
              expect(executeSpan).toBeDefined();
              expect(executeSpan?.parent_span_id).toBe(event.contexts?.trace?.span_id);
            },
          })
          .start()
          .completed();
      });
    },
    { additionalDependencies: { graphql: '^17' } },
  );
});
