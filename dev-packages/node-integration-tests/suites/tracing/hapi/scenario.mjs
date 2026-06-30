import Boom from '@hapi/boom';
import Hapi from '@hapi/hapi';
import * as Sentry from '@sentry/node';
import { sendPortToRunner } from '@sentry-internal/node-integration-tests';

const port = 5999;

const run = async () => {
  const server = Hapi.server({
    host: 'localhost',
    port,
  });

  server.route({
    method: 'GET',
    path: '/',
    handler: () => {
      return 'Hello World!';
    },
  });

  server.route({
    method: 'GET',
    path: '/error',
    handler: () => {
      return new Error('Sentry Test Error');
    },
  });

  server.route({
    method: 'GET',
    path: '/error/{id}',
    handler: () => {
      return new Error('Sentry Test Error');
    },
  });

  server.route({
    method: 'GET',
    path: '/boom-error',
    handler: () => {
      return new Boom.Boom('Sentry Test Error');
    },
  });

  server.route({
    method: 'GET',
    path: '/promise-error',
    handler: async () => {
      return Promise.reject(new Error('Sentry Test Error'));
    },
  });

  // Route registered via a plugin produces a `plugin.hapi` span.
  await server.register({
    name: 'testPlugin',
    version: '1.0.0',
    register: async function (pluginServer) {
      pluginServer.route({
        method: 'GET',
        path: '/plugin-route',
        handler: () => 'Hello from plugin!',
      });
    },
  });

  // Server extension produces a `server.ext.hapi` span.
  server.ext('onPreResponse', (request, h) => h.continue);

  await Sentry.setupHapiErrorHandler(server);
  await server.start();

  sendPortToRunner(port);
};

run();
