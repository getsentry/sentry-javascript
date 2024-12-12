import { createRunner } from '../../../../utils/runner';

// Graphql Instrumentation emits some spans by default on server start
const EXPECTED_START_SERVER_TRANSACTION = {
  transaction: 'Test Server Start',
};

describe('GraphQL/Apollo Tests > useOperationNameForRootSpan', () => {
  test('useOperationNameForRootSpan works with single query operation', done => {
    const EXPECTED_TRANSACTION = {
      transaction: 'GET /test-graphql (query GetHello)',
      spans: expect.arrayContaining([
        expect.objectContaining({
          data: {
            'graphql.operation.name': 'GetHello',
            'graphql.operation.type': 'query',
            'graphql.source': 'query GetHello {hello}',
            'sentry.origin': 'auto.graphql.otel.graphql',
          },
          description: 'query GetHello',
          status: 'ok',
          origin: 'auto.graphql.otel.graphql',
        }),
      ]),
    };

    createRunner(__dirname, 'scenario-query.js')
      .expect({ transaction: EXPECTED_START_SERVER_TRANSACTION })
      .expect({ transaction: EXPECTED_TRANSACTION })
      .start(done);
  });

  test('useOperationNameForRootSpan works with single mutation operation', done => {
    const EXPECTED_TRANSACTION = {
      transaction: 'GET /test-graphql (mutation TestMutation)',
      spans: expect.arrayContaining([
        expect.objectContaining({
          data: {
            'graphql.operation.name': 'TestMutation',
            'graphql.operation.type': 'mutation',
            'graphql.source': `mutation TestMutation($email: String) {
  login(email: $email)
}`,
            'sentry.origin': 'auto.graphql.otel.graphql',
          },
          description: 'mutation TestMutation',
          status: 'ok',
          origin: 'auto.graphql.otel.graphql',
        }),
      ]),
    };

    createRunner(__dirname, 'scenario-mutation.js')
      .expect({ transaction: EXPECTED_START_SERVER_TRANSACTION })
      .expect({ transaction: EXPECTED_TRANSACTION })
      .start(done);
  });

  test('useOperationNameForRootSpan ignores an invalid root span', done => {
    const EXPECTED_TRANSACTION = {
      transaction: 'test span name',
      spans: expect.arrayContaining([
        expect.objectContaining({
          data: {
            'graphql.operation.name': 'GetHello',
            'graphql.operation.type': 'query',
            'graphql.source': 'query GetHello {hello}',
            'sentry.origin': 'auto.graphql.otel.graphql',
          },
          description: 'query GetHello',
          status: 'ok',
          origin: 'auto.graphql.otel.graphql',
        }),
      ]),
    };

    createRunner(__dirname, 'scenario-invalid-root-span.js')
      .expect({ transaction: EXPECTED_START_SERVER_TRANSACTION })
      .expect({ transaction: EXPECTED_TRANSACTION })
      .start(done);
  });

  test('useOperationNameForRootSpan works with single query operation without name', done => {
    const EXPECTED_TRANSACTION = {
      transaction: 'GET /test-graphql (query)',
      spans: expect.arrayContaining([
        expect.objectContaining({
          data: {
            'graphql.operation.type': 'query',
            'graphql.source': 'query {hello}',
            'sentry.origin': 'auto.graphql.otel.graphql',
          },
          description: 'query',
          status: 'ok',
          origin: 'auto.graphql.otel.graphql',
        }),
      ]),
    };

    createRunner(__dirname, 'scenario-no-operation-name.js')
      .expect({ transaction: EXPECTED_START_SERVER_TRANSACTION })
      .expect({ transaction: EXPECTED_TRANSACTION })
      .start(done);
  });

  test('useOperationNameForRootSpan works with multiple query operations', done => {
    const EXPECTED_TRANSACTION = {
      transaction: 'GET /test-graphql (query GetHello, query GetWorld)',
      spans: expect.arrayContaining([
        expect.objectContaining({
          data: {
            'graphql.operation.name': 'GetHello',
            'graphql.operation.type': 'query',
            'graphql.source': 'query GetHello {hello}',
            'sentry.origin': 'auto.graphql.otel.graphql',
          },
          description: 'query GetHello',
          status: 'ok',
          origin: 'auto.graphql.otel.graphql',
        }),
        expect.objectContaining({
          data: {
            'graphql.operation.name': 'GetWorld',
            'graphql.operation.type': 'query',
            'graphql.source': 'query GetWorld {world}',
            'sentry.origin': 'auto.graphql.otel.graphql',
          },
          description: 'query GetWorld',
          status: 'ok',
          origin: 'auto.graphql.otel.graphql',
        }),
      ]),
    };

    createRunner(__dirname, 'scenario-multiple-operations.js')
      .expect({ transaction: EXPECTED_START_SERVER_TRANSACTION })
      .expect({ transaction: EXPECTED_TRANSACTION })
      .start(done);
  });

  test('useOperationNameForRootSpan works with more than 5 query operations', done => {
    const EXPECTED_TRANSACTION = {
      transaction:
        'GET /test-graphql (query GetHello1, query GetHello2, query GetHello3, query GetHello4, query GetHello5, +4)',
    };

    createRunner(__dirname, 'scenario-multiple-operations-many.js')
      .expect({ transaction: EXPECTED_START_SERVER_TRANSACTION })
      .expect({ transaction: EXPECTED_TRANSACTION })
      .start(done);
  });
});
