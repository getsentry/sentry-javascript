import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

// Server start transaction (Apollo Server v5 no longer runs introspection query on start)
const EXPECTED_START_SERVER_TRANSACTION = {
  transaction: 'Test Server Start',
};

const ORIGIN = 'auto.graphql.diagnostic_channel';

function graphqlExecuteSpan(opts: {
  description: string;
  operationType: string;
  operationName?: string;
  document: unknown;
  status?: string;
}): ReturnType<typeof expect.objectContaining> {
  const { description, operationType, operationName, document, status = 'ok' } = opts;
  return expect.objectContaining({
    description,
    status,
    origin: ORIGIN,
    data: expect.objectContaining({
      'graphql.operation.type': operationType,
      ...(operationName ? { 'graphql.operation.name': operationName } : {}),
      'graphql.document': document,
      'sentry.origin': ORIGIN,
    }),
  });
}

describe('GraphQL/Apollo Tests', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  describe('query', () => {
    const EXPECTED_TRANSACTION = {
      transaction: 'Test Transaction (query)',
      spans: expect.arrayContaining([
        graphqlExecuteSpan({ description: 'query', operationType: 'query', document: '{hello}' }),
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
            .unordered()
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
        graphqlExecuteSpan({
          description: 'mutation Mutation',
          operationType: 'mutation',
          operationName: 'Mutation',
          document: 'mutation Mutation($email: String) {\n  login(email: $email)\n}',
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
            .unordered()
            .start()
            .completed();
        });
      },
      { copyPaths: ['apollo-server.mjs'] },
    );
  });

  describe('redaction', () => {
    const EXPECTED_TRANSACTION = {
      transaction: 'Test Transaction (mutation)',
      spans: expect.arrayContaining([
        // The inline email literal must be redacted to `"*"`, so the raw value never reaches the span.
        graphqlExecuteSpan({
          description: 'mutation',
          operationType: 'mutation',
          document: expect.stringContaining('login(email: "*")'),
        }),
      ]),
    };

    createEsmAndCjsTests(
      __dirname,
      'scenario-redaction.mjs',
      'instrument.mjs',
      (createTestRunner, test) => {
        test('redacts inline literal values from the graphql document.', async () => {
          await createTestRunner()
            .expect({ transaction: EXPECTED_START_SERVER_TRANSACTION })
            .expect({ transaction: EXPECTED_TRANSACTION })
            .unordered()
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
        graphqlExecuteSpan({
          description: 'mutation Mutation',
          operationType: 'mutation',
          operationName: 'Mutation',
          document: 'mutation Mutation($email: String) {\n  login(email: $email)\n}',
          status: 'internal_error',
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
            .unordered()
            .start()
            .completed();
        });
      },
      { copyPaths: ['apollo-server.mjs'] },
    );
  });
});
