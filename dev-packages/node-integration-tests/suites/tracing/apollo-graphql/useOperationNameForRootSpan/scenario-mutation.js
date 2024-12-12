const Sentry = require('@sentry/node');
const { loggingTransport } = require('@sentry-internal/node-integration-tests');

const client = Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  integrations: [Sentry.graphqlIntegration({ useOperationNameForRootSpan: true })],
  transport: loggingTransport,
});

const tracer = client.tracer;

// Stop the process from exiting before the transaction is sent
setInterval(() => {}, 1000);

async function run() {
  const { gql } = require('apollo-server');
  const server = require('../apollo-server')();

  await tracer.startActiveSpan(
    'test span name',
    {
      kind: 1,
      attributes: { 'http.method': 'GET', 'http.route': '/test-graphql' },
    },
    async span => {
      // Ref: https://www.apollographql.com/docs/apollo-server/testing/testing/#testing-using-executeoperation
      await server.executeOperation({
        query: gql`mutation TestMutation($email: String){
          login(email: $email)
        }`,
        variables: { email: 'test@email.com' },
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
