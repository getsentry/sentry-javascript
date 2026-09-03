import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';

// Server start transaction (Apollo Server v5 no longer runs introspection query on start)
const EXPECTED_START_SERVER_TRANSACTION = {
  transaction: 'Test Server Start',
};

describe('GraphQL/Apollo Tests > useOperationNameForRootSpan', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  describe('single query operation', () => {
    const EXPECTED_TRANSACTION = {
      transaction: 'test span name (query GetHello)',
      spans: expect.arrayContaining([
        expect.objectContaining({
          data: {
            'graphql.operation.name': 'GetHello',
            'graphql.operation.type': 'query',
            'graphql.document': 'query GetHello {hello}',
            'sentry.origin': 'auto.graphql.diagnostic_channel',
            'sentry.op': 'graphql',
            'graphql.processing.type': 'execute',
          },
          description: 'query GetHello',
          status: 'ok',
          origin: 'auto.graphql.diagnostic_channel',
        }),
      ]),
    };

    createEsmAndCjsTests(__dirname, 'scenario-query.mjs', 'instrument.mjs', (createTestRunner, test) => {
      test('useOperationNameForRootSpan works with single query operation', async () => {
        await createTestRunner()
          .expect({ transaction: EXPECTED_START_SERVER_TRANSACTION })
          .expect({ transaction: EXPECTED_TRANSACTION })
          .start()
          .completed();
      });
    });
  });

  describe('single mutation operation', () => {
    const EXPECTED_TRANSACTION = {
      transaction: 'test span name (mutation TestMutation)',
      spans: expect.arrayContaining([
        expect.objectContaining({
          data: {
            'graphql.operation.name': 'TestMutation',
            'graphql.operation.type': 'mutation',
            'graphql.document': `mutation TestMutation($email: String) {
  login(email: $email)
}`,
            'sentry.origin': 'auto.graphql.diagnostic_channel',
            'sentry.op': 'graphql',
            'graphql.processing.type': 'execute',
          },
          description: 'mutation TestMutation',
          status: 'ok',
          origin: 'auto.graphql.diagnostic_channel',
        }),
      ]),
    };

    createEsmAndCjsTests(__dirname, 'scenario-mutation.mjs', 'instrument.mjs', (createTestRunner, test) => {
      test('useOperationNameForRootSpan works with single mutation operation', async () => {
        await createTestRunner()
          .expect({ transaction: EXPECTED_START_SERVER_TRANSACTION })
          .expect({ transaction: EXPECTED_TRANSACTION })
          .start()
          .completed();
      });
    });
  });

  describe('query without name', () => {
    const EXPECTED_TRANSACTION = {
      transaction: 'test span name (query)',
      spans: expect.arrayContaining([
        expect.objectContaining({
          data: {
            'graphql.operation.type': 'query',
            'graphql.document': 'query {hello}',
            'sentry.origin': 'auto.graphql.diagnostic_channel',
            'sentry.op': 'graphql',
            'graphql.processing.type': 'execute',
          },
          description: 'query',
          status: 'ok',
          origin: 'auto.graphql.diagnostic_channel',
        }),
      ]),
    };

    createEsmAndCjsTests(__dirname, 'scenario-no-operation-name.mjs', 'instrument.mjs', (createTestRunner, test) => {
      test('useOperationNameForRootSpan works with single query operation without name', async () => {
        await createTestRunner()
          .expect({ transaction: EXPECTED_START_SERVER_TRANSACTION })
          .expect({ transaction: EXPECTED_TRANSACTION })
          .start()
          .completed();
      });
    });
  });

  describe('multiple operations', () => {
    const EXPECTED_TRANSACTION = {
      transaction: 'test span name (query GetHello, query GetWorld)',
      spans: expect.arrayContaining([
        expect.objectContaining({
          data: {
            'graphql.operation.name': 'GetHello',
            'graphql.operation.type': 'query',
            'graphql.document': 'query GetHello {hello}',
            'sentry.origin': 'auto.graphql.diagnostic_channel',
            'sentry.op': 'graphql',
            'graphql.processing.type': 'execute',
          },
          description: 'query GetHello',
          status: 'ok',
          origin: 'auto.graphql.diagnostic_channel',
        }),
        expect.objectContaining({
          data: {
            'graphql.operation.name': 'GetWorld',
            'graphql.operation.type': 'query',
            'graphql.document': 'query GetWorld {world}',
            'sentry.origin': 'auto.graphql.diagnostic_channel',
            'sentry.op': 'graphql',
            'graphql.processing.type': 'execute',
          },
          description: 'query GetWorld',
          status: 'ok',
          origin: 'auto.graphql.diagnostic_channel',
        }),
      ]),
    };

    createEsmAndCjsTests(__dirname, 'scenario-multiple-operations.mjs', 'instrument.mjs', (createTestRunner, test) => {
      test('useOperationNameForRootSpan works with multiple query operations', async () => {
        await createTestRunner()
          .expect({ transaction: EXPECTED_START_SERVER_TRANSACTION })
          .expect({ transaction: EXPECTED_TRANSACTION })
          .start()
          .completed();
      });
    });
  });

  describe('many operations', () => {
    const EXPECTED_TRANSACTION = {
      transaction:
        'test span name (query GetHello1, query GetHello2, query GetHello3, query GetHello4, query GetHello5, +4)',
    };

    createEsmAndCjsTests(
      __dirname,
      'scenario-multiple-operations-many.mjs',
      'instrument.mjs',
      (createTestRunner, test) => {
        test('useOperationNameForRootSpan works with more than 5 query operations', async () => {
          await createTestRunner()
            .expect({ transaction: EXPECTED_START_SERVER_TRANSACTION })
            .expect({ transaction: EXPECTED_TRANSACTION })
            .start()
            .completed();
        });
      },
    );
  });
});
