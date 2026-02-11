const Sentry = require('@sentry/node');

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: process.env.E2E_TEST_DSN,
  includeLocalVariables: true,
  debug: !!process.env.DEBUG,
  tunnel: `http://localhost:3031/`, // proxy server
  tracesSampleRate: 1,
});

const Hapi = require('@hapi/hapi');
const Boom = require('@hapi/boom');

const server = Hapi.server({
  port: 3030,
  host: 'localhost',
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
      Sentry.setTag(`param-${request.params.param}`, 'yes');

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

  server.route({
    method: 'GET',
    path: '/test-failure-boom-4xx',
    handler: async function (request, h) {
      throw new Error('This is a JS error (boom in onPreResponse)');
    },
  });

  server.route({
    method: 'GET',
    path: '/test-failure-boom-5xx',
    handler: async function (request, h) {
      throw new Error('This is an error (boom in onPreResponse)');
    },
  });

  server.route({
    method: 'GET',
    path: '/test-failure-JS-error-onPreResponse',
    handler: async function (request, h) {
      throw new Error('This is an error (another JS error in onPreResponse)');
    },
  });

  server.route({
    method: 'GET',
    path: '/test-failure-2xx-override-onPreResponse',
    handler: async function (request, h) {
      throw new Error('This is a JS error (2xx override in onPreResponse)');
    },
  });

  // This runs after the route handler
  server.ext('onPreResponse', (request, h) => {
    const path = request.route.path;

    if (path.includes('boom-4xx')) {
      throw Boom.badRequest('4xx bad request (onPreResponse)');
    } else if (path.includes('boom-5xx')) {
      throw Boom.gatewayTimeout('5xx not implemented (onPreResponse)');
    } else if (path.includes('JS-error-onPreResponse')) {
      throw new Error('JS error (onPreResponse)');
    } else if (path.includes('2xx-override-onPreResponse')) {
      return h.response('2xx override').code(200);
    } else {
      return h.continue;
    }
  });
};

(async () => {
  init();
  await Sentry.setupHapiErrorHandler(server);
  await server.start();
  console.log('Server running on %s', server.info.uri);
})();
