import * as Sentry from '@sentry/node';
import * as Tracing from '@sentry/tracing';
import { ApolloServer, gql } from 'apollo-server';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  // eslint-disable-next-line deprecation/deprecation
  integrations: [new Tracing.Integrations.GraphQL(), new Tracing.Integrations.Apollo()],
});

const typeDefs = gql`
  type Query {
    hello: String
  }
`;

const resolvers = {
  Query: {
    hello: () => {
      return 'Hello world!';
    },
  },
};

const server = new ApolloServer({
  typeDefs,
  resolvers,
});

const transaction = Sentry.startTransaction({ name: 'test_transaction', op: 'transaction' });

Sentry.configureScope(scope => {
  scope.setSpan(transaction);
});

void (async () => {
  // Ref: https://www.apollographql.com/docs/apollo-server/testing/testing/#testing-using-executeoperation
  await server.executeOperation({
    query: '{hello}',
  });

  transaction.finish();
})();
