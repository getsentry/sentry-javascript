import { createRunner } from '../../../../utils/runner';

describe('GraphQL/Apollo Tests > useOperationNameForRootSpan', () => {
  test('useOperationNameForRootSpan works with single query operation', done => {
    const EXPECTED_TRANSACTION = {
      transaction: 'query GetHello',
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

    createRunner(__dirname, 'scenario-query.js').expect({ transaction: EXPECTED_TRANSACTION }).start(done);
  });

  test('useOperationNameForRootSpan works with single mutation operation', done => {
    const EXPECTED_TRANSACTION = {
      transaction: 'mutation TestMutation',
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

    createRunner(__dirname, 'scenario-mutation.js').expect({ transaction: EXPECTED_TRANSACTION }).start(done);
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

    createRunner(__dirname, 'scenario-invalid-root-span.js').expect({ transaction: EXPECTED_TRANSACTION }).start(done);
  });

  test('useOperationNameForRootSpan works with single query operation without name', done => {
    const EXPECTED_TRANSACTION = {
      transaction: 'query',
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

    createRunner(__dirname, 'scenario-no-operation-name.js').expect({ transaction: EXPECTED_TRANSACTION }).start(done);
  });
});
