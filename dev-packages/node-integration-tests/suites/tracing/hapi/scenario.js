const { loggingTransport, sendPortToRunner } = require('@sentry-internal/node-integration-tests');
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
});

const Hapi = require('@hapi/hapi');
const Boom = require('@hapi/boom');

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

  server.route({
    method: 'GET',
    path: '/error',
    handler: (_request, _h) => {
      return new Error('Sentry Test Error');
    },
  });

  server.route({
    method: 'GET',
    path: '/error/{id}',
    handler: (_request, _h) => {
      return new Error('Sentry Test Error');
    },
  });

  server.route({
    method: 'GET',
    path: '/boom-error',
    handler: (_request, _h) => {
      return new Boom.Boom('Sentry Test Error');
    },
  });

  server.route({
    method: 'GET',
    path: '/promise-error',
    handler: async (_request, _h) => {
      return Promise.reject(new Error('Sentry Test Error'));
    },
  });

  await Sentry.setupHapiErrorHandler(server);
  await server.start();

  sendPortToRunner(port);
};

init();
