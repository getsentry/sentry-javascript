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
        origin: 'auto.graphql.diagnostic_channel',
        data: expect.objectContaining({
          'graphql.operation.type': 'query',
          'graphql.processing.type': 'execute',
          'graphql.document': '{hello}',
          'sentry.origin': 'auto.graphql.diagnostic_channel',
        }),
      }),
      expect.objectContaining({
        description: 'graphql.parse',
        data: expect.objectContaining({ 'graphql.processing.type': 'parse' }),
      }),
      expect.objectContaining({
        description: 'graphql.validate',
        data: expect.objectContaining({ 'graphql.processing.type': 'validate' }),
      }),
      expect.objectContaining({
        description: 'graphql.resolve hello',
        data: expect.objectContaining({
          'graphql.processing.type': 'resolve',
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

  // Same behavior on the diagnostics-channel path: passing the channel integration explicitly (see
  // instrument-dc.mjs) must carry `ignoreResolveSpans: false` through — the explicit instance wins over
  // the swapped-in default — and emit resolve spans with the orchestrion origin.
  const EXPECTED_ORCHESTRION_TRANSACTION = {
    transaction: 'Test Transaction (query)',
    spans: expect.arrayContaining([
      expect.objectContaining({
        description: 'query',
        origin: 'auto.graphql.diagnostic_channel',
        data: expect.objectContaining({
          'graphql.operation.type': 'query',
          'graphql.processing.type': 'execute',
          'graphql.document': '{hello}',
          'sentry.origin': 'auto.graphql.diagnostic_channel',
        }),
      }),
      expect.objectContaining({
        description: 'graphql.parse',
        data: expect.objectContaining({ 'graphql.processing.type': 'parse' }),
      }),
      expect.objectContaining({
        description: 'graphql.validate',
        data: expect.objectContaining({ 'graphql.processing.type': 'validate' }),
      }),
      expect.objectContaining({
        description: 'graphql.resolve hello',
        data: expect.objectContaining({
          'graphql.processing.type': 'resolve',
          'graphql.field.name': 'hello',
          'graphql.field.path': 'hello',
          'graphql.field.type': 'String',
          'graphql.parent.name': 'Query',
        }),
      }),
    ]),
  };

  createEsmAndCjsTests(__dirname, 'scenario-query.mjs', 'instrument-dc.mjs', (createTestRunner, test) => {
    test('emits resolve spans via diagnostics-channel injection when configured explicitly', async () => {
      await createTestRunner()
        .expect({ transaction: EXPECTED_START_SERVER_TRANSACTION })
        .expect({ transaction: EXPECTED_ORCHESTRION_TRANSACTION })
        .start()
        .completed();
    });
  });
});
