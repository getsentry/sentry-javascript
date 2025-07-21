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
  const { gql } = require('apollo-server');
  const server = require('./apollo-server')();

  await Sentry.startSpan(
    {
      name: 'Test Transaction',
      op: 'transaction',
    },
    async span => {
      // Ref: https://www.apollographql.com/docs/apollo-server/testing/testing/#testing-using-executeoperation
      await server.executeOperation({
        query: gql`
          mutation Mutation($email: String) {
            login(email: $email)
          }
        `,
        // We want to trigger an error by passing an invalid variable type
        variables: { email: 123 },
      });

      setTimeout(() => {
        span.end();
        server.stop();
      }, 500);
    },
  );
}

run();
