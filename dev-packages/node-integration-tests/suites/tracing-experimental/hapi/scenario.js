const { loggingTransport, sendPortToRunner } = require('@sentry-internal/node-integration-tests');
const Sentry = require('@sentry/node-experimental');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
});

const Hapi = require('@hapi/hapi');

const port = 5999;

const init = async () => {
  const server = Hapi.server({
    host: 'localhost',
    port,
  });

  server.route({
    method: 'GET',
    path: '/',
    handler: (_request, _h) => {
      return 'Hello World!';
    },
  });

  await Sentry.setupHapiErrorHandler(server);
  await server.start();

  sendPortToRunner(port);
};

init();
