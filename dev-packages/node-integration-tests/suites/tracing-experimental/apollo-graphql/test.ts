import { conditionalTest } from '../../../utils';
import { createRunner } from '../../../utils/runner';

jest.setTimeout(10000);

// Node 10 is not supported by `graphql-js`
// Ref: https://github.com/graphql/graphql-js/blob/main/package.json
conditionalTest({ min: 12 })('GraphQL/Apollo Tests', () => {
  const EXPECTED_TRANSACTION = {
    transaction: 'Test Transaction',
    spans: expect.arrayContaining([
      expect.objectContaining({
        data: {
          'graphql.operation.type': 'query',
          'graphql.source': '{hello}',
          'otel.kind': 'INTERNAL',
          'sentry.origin': 'auto.graphql.otel.graphql',
        },
        description: 'query',
        status: 'ok',
        origin: 'auto.graphql.otel.graphql',
      }),
      expect.objectContaining({
        data: {
          'graphql.field.name': 'hello',
          'graphql.field.path': 'hello',
          'graphql.field.type': 'String',
          'graphql.source': 'hello',
          'otel.kind': 'INTERNAL',
          'sentry.origin': 'manual',
        },
        description: 'graphql.resolve',
        status: 'ok',
        origin: 'manual',
      }),
    ]),
  };

  test('CJS - should instrument GraphQL queries used from Apollo Server.', done => {
    createRunner(__dirname, 'scenario.js').expect({ transaction: EXPECTED_TRANSACTION }).start(done);
  });
});
