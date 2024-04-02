const { loggingTransport, sendPortToRunner } = require('@sentry-internal/node-integration-tests');
const Sentry = require('@sentry/node');
const Hapi = require('@hapi/hapi');

const port = 5999;

const init = async () => {
  const server = Hapi.server({
    host: 'localhost',
    port,
  });

  Sentry.init({
    dsn: 'https://public@dsn.ingest.sentry.io/1337',
    release: '1.0',
    tracesSampleRate: 1.0,
    transport: loggingTransport,
    integrations: [new Sentry.Integrations.Hapi({ server })],
  });

  server.route({
    method: 'GET',
    path: '/',
    handler: async () => {
      return 'Hello World!';
    },
  });

  await server.start();

  sendPortToRunner(port);
};

init();
