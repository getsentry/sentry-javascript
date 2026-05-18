import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

// Server start transaction (Apollo Server v5 no longer runs introspection query on start)
const EXPECTED_START_SERVER_TRANSACTION = {
  transaction: 'Test Server Start',
};

describe('GraphQL/Apollo Tests', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  describe('query', () => {
    const EXPECTED_TRANSACTION = {
      transaction: 'Test Transaction (query)',
      spans: expect.arrayContaining([
        expect.objectContaining({
          data: {
            'graphql.operation.type': 'query',
            'graphql.source': '{hello}',
            'sentry.origin': 'auto.graphql.otel.graphql',
          },
          description: 'query',
          status: 'ok',
          origin: 'auto.graphql.otel.graphql',
        }),
      ]),
    };

    createEsmAndCjsTests(
      __dirname,
      'scenario-query.mjs',
      'instrument.mjs',
      (createTestRunner, test) => {
        test('should instrument GraphQL queries used from Apollo Server.', async () => {
          await createTestRunner()
            .expect({ transaction: EXPECTED_START_SERVER_TRANSACTION })
            .expect({ transaction: EXPECTED_TRANSACTION })
            .start()
            .completed();
        });
      },
      { copyPaths: ['apollo-server.mjs'] },
    );
  });

  describe('mutation', () => {
    const EXPECTED_TRANSACTION = {
      transaction: 'Test Transaction (mutation Mutation)',
      spans: expect.arrayContaining([
        expect.objectContaining({
          data: {
            'graphql.operation.name': 'Mutation',
            'graphql.operation.type': 'mutation',
            'graphql.source': 'mutation Mutation($email: String) {\n  login(email: $email)\n}',
            'sentry.origin': 'auto.graphql.otel.graphql',
          },
          description: 'mutation Mutation',
          status: 'ok',
          origin: 'auto.graphql.otel.graphql',
        }),
      ]),
    };

    createEsmAndCjsTests(
      __dirname,
      'scenario-mutation.mjs',
      'instrument.mjs',
      (createTestRunner, test) => {
        test('should instrument GraphQL mutations used from Apollo Server.', async () => {
          await createTestRunner()
            .expect({ transaction: EXPECTED_START_SERVER_TRANSACTION })
            .expect({ transaction: EXPECTED_TRANSACTION })
            .start()
            .completed();
        });
      },
      { copyPaths: ['apollo-server.mjs'] },
    );
  });

  describe('error', () => {
    const EXPECTED_TRANSACTION = {
      transaction: 'Test Transaction (mutation Mutation)',
      spans: expect.arrayContaining([
        expect.objectContaining({
          data: {
            'graphql.operation.name': 'Mutation',
            'graphql.operation.type': 'mutation',
            'graphql.source': 'mutation Mutation($email: String) {\n  login(email: $email)\n}',
            'sentry.origin': 'auto.graphql.otel.graphql',
          },
          description: 'mutation Mutation',
          status: 'internal_error',
          origin: 'auto.graphql.otel.graphql',
        }),
      ]),
    };

    createEsmAndCjsTests(
      __dirname,
      'scenario-error.mjs',
      'instrument.mjs',
      (createTestRunner, test) => {
        test('should handle GraphQL errors.', async () => {
          await createTestRunner()
            .expect({ transaction: EXPECTED_START_SERVER_TRANSACTION })
            .expect({ transaction: EXPECTED_TRANSACTION })
            .start()
            .completed();
        });
      },
      { copyPaths: ['apollo-server.mjs'] },
    );
  });
});
