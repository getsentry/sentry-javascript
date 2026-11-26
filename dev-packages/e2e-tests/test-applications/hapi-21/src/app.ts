import Boom from '@hapi/boom';
import Hapi from '@hapi/hapi';
import * as Sentry from './sentry';

export const server = Hapi.server({
  port: 3030,
  host: 'localhost',
});

server.route({
  method: 'GET',
  path: '/test-success',
  handler: function () {
    return { version: 'v1' };
  },
});

server.route({
  method: 'GET',
  path: '/test-param/{param}',
  handler: function (request) {
    Sentry.setAttribute(`param-${request.params.param}`, 'yes');

    return { paramWas: request.params.param };
  },
});

server.route({
  method: 'GET',
  path: '/test-log',
  handler: function () {
    Sentry.logger.debug('Accessed /test-log route');
    return { message: 'Log sent' };
  },
});

server.route({
  method: 'GET',
  path: '/test-error',
  handler: async function () {
    const exceptionId = Sentry.captureException(new Error('This is an error'));

    await Sentry.flush(2000);

    return { exceptionId };
  },
});

server.route({
  method: 'GET',
  path: '/test-error/{id}',
  handler: function (request) {
    throw new Error(`This is an error with id ${request.params.id}`);
  },
});

server.route({
  method: 'GET',
  path: '/test-failure',
  handler: async function () {
    throw new Error('This is an error');
  },
});

server.route({
  method: 'GET',
  path: '/test-failure-boom-4xx',
  handler: async function () {
    throw new Error('This is a JS error (boom in onPreResponse)');
  },
});

server.route({
  method: 'GET',
  path: '/test-failure-boom-5xx',
  handler: async function () {
    throw new Error('This is an error (boom in onPreResponse)');
  },
});

server.route({
  method: 'GET',
  path: '/test-failure-JS-error-onPreResponse',
  handler: async function () {
    throw new Error('This is an error (another JS error in onPreResponse)');
  },
});

server.route({
  method: 'GET',
  path: '/test-failure-2xx-override-onPreResponse',
  handler: async function () {
    throw new Error('This is a JS error (2xx override in onPreResponse)');
  },
});

server.route({
  method: 'GET',
  path: '/test-isolation/{id}',
  handler: async function (request) {
    Sentry.setTag('isolation-id', request.params.id);
    // Lets the concurrent requests of the isolation test overlap.
    await new Promise(resolve => setTimeout(resolve, 200));
    Sentry.captureException(new Error(`Isolated error ${request.params.id}`));
    return {};
  },
});

// The test runs a server on port 3040 that records the headers of the request.
server.route({
  method: 'GET',
  path: '/test-outgoing-fetch',
  handler: async function () {
    const response = await fetch('http://localhost:3040/outgoing');
    return { status: response.status };
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
