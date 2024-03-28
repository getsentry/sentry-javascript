const Sentry = require('@sentry/node');
const { loggingTransport } = require('@sentry-internal/node-integration-tests');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
});

// Stop the process from exiting before the transaction is sent
setInterval(() => {}, 1000);

async function run() {
  const { ApolloServer, gql } = require('apollo-server');

  await Sentry.startSpan(
    {
      name: 'Test Transaction',
      op: 'transaction',
    },
    async span => {
      const typeDefs = gql`type Query { hello: String }`;

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

      // Ref: https://www.apollographql.com/docs/apollo-server/testing/testing/#testing-using-executeoperation
      await server.executeOperation({
        query: '{hello}',
      });

      setTimeout(() => {
        span.end();
        server.stop();
      }, 500);
    },
  );
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
run();
