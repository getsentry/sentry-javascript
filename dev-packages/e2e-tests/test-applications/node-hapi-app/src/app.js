const Sentry = require('@sentry/node');
const Hapi = require('@hapi/hapi');

const server = Hapi.server({
  port: 3030,
  host: 'localhost',
});

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: process.env.E2E_TEST_DSN,
  includeLocalVariables: true,
  debug: true,
  tunnel: `http://localhost:3031/`, // proxy server
  tracesSampleRate: 1,
});

const init = async () => {
  server.route({
    method: 'GET',
    path: '/test-success',
    handler: function (request, h) {
      return { version: 'v1' };
    },
  });

  server.route({
    method: 'GET',
    path: '/test-param/{param}',
    handler: function (request, h) {
      return { paramWas: request.params.param };
    },
  });

  server.route({
    method: 'GET',
    path: '/test-error',
    handler: async function (request, h) {
      const exceptionId = Sentry.captureException(new Error('This is an error'));

      await Sentry.flush(2000);

      return { exceptionId };
    },
  });

  server.route({
    method: 'GET',
    path: '/test-error/{id}',
    handler: function (request) {
      console.log('This is an error with id', request.params.id);
      throw new Error(`This is an error with id ${request.params.id}`);
    },
  });

  server.route({
    method: 'GET',
    path: '/test-failure',
    handler: async function (request, h) {
      throw new Error('This is an error');
    },
  });
};

(async () => {
  init();
  await Sentry.setupHapiErrorHandler(server);
  await server.start();
  console.log('Server running on %s', server.info.uri);
})();
