const { loggingTransport } = require('@sentry-internal/node-integration-tests');
const Sentry = require('@sentry/aws-serverless');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  tracesSampleRate: 1.0,
  integrations: [Sentry.graphqlIntegration({ useOperationNameForRootSpan: true })],
  transport: loggingTransport,
});

async function run() {
  const apolloServer = require('./apollo-server')();

  await Sentry.startSpan({ name: 'Test Transaction' }, async span => {
    // Ref: https://www.apollographql.com/docs/apollo-server/testing/testing/#testing-using-executeoperation
    await apolloServer.executeOperation({
      query: 'query GetHello {hello}',
    });

    setTimeout(() => {
      span.end();
      apolloServer.stop();
    }, 500);
  });
}

run();
