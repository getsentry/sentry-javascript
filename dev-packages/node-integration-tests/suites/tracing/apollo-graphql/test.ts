import { describe, expect, test } from 'vitest';
import { createRunner } from '../../../utils/runner';

// Graphql Instrumentation emits some spans by default on server start
const EXPECTED_START_SERVER_TRANSACTION = {
  transaction: 'Test Server Start (query IntrospectionQuery)',
};

describe('GraphQL/Apollo Tests', () => {
  test('should instrument GraphQL queries used from Apollo Server.', async () => {
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

    await createRunner(__dirname, 'scenario-query.js')
      .expect({ transaction: EXPECTED_START_SERVER_TRANSACTION })
      .expect({ transaction: EXPECTED_TRANSACTION })
      .start()
      .completed();
  });

  test('should instrument GraphQL mutations used from Apollo Server.', async () => {
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

    await createRunner(__dirname, 'scenario-mutation.js')
      .expect({ transaction: EXPECTED_START_SERVER_TRANSACTION })
      .expect({ transaction: EXPECTED_TRANSACTION })
      .start()
      .completed();
  });

  test('should handle GraphQL errors.', async () => {
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

    await createRunner(__dirname, 'scenario-error.js')
      .expect({ transaction: EXPECTED_START_SERVER_TRANSACTION })
      .expect({ transaction: EXPECTED_TRANSACTION })
      .start()
      .completed();
  });
});
