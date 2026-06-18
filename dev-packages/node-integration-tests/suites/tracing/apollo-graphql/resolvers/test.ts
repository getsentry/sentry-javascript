import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';

// Server start transaction (Apollo Server v5 no longer runs introspection query on start)
const EXPECTED_START_SERVER_TRANSACTION = {
  transaction: 'Test Server Start',
};

describe('GraphQL/Apollo Tests > resolve spans', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  // With `ignoreResolveSpans: false`, the instrumentation emits a span for the execute step as well as
  // for `parse`, `validate` and each (non-trivial) field resolver.
  const EXPECTED_TRANSACTION = {
    // `useOperationNameForRootSpan` defaults to true, so the root span name gets the operation appended.
    transaction: 'Test Transaction (query)',
    spans: expect.arrayContaining([
      expect.objectContaining({
        description: 'query',
        origin: 'auto.graphql.otel.graphql',
        data: expect.objectContaining({
          'graphql.operation.type': 'query',
          'graphql.source': '{hello}',
          'sentry.origin': 'auto.graphql.otel.graphql',
        }),
      }),
      expect.objectContaining({ description: 'graphql.parse' }),
      expect.objectContaining({ description: 'graphql.validate' }),
      expect.objectContaining({
        description: 'graphql.resolve hello',
        data: expect.objectContaining({
          'graphql.field.name': 'hello',
          'graphql.field.path': 'hello',
          'graphql.field.type': 'String',
          'graphql.parent.name': 'Query',
        }),
      }),
    ]),
  };

  createEsmAndCjsTests(__dirname, 'scenario-query.mjs', 'instrument.mjs', (createTestRunner, test) => {
    test('emits parse, validate and resolve spans when ignoreResolveSpans is false', async () => {
      await createTestRunner()
        .expect({ transaction: EXPECTED_START_SERVER_TRANSACTION })
        .expect({ transaction: EXPECTED_TRANSACTION })
        .start()
        .completed();
    });
  });
});
