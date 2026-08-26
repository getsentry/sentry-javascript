import Hapi from '@hapi/hapi';
import * as Sentry from '@sentry/node';
import { sendPortToRunner } from '@sentry-internal/node-integration-tests';

const run = async () => {
  const server = Hapi.server({
    host: 'localhost',
    port: 0,
  });

  server.route({
    method: 'GET',
    path: '/dropped',
    handler: () => new Error('Dropped error'),
  });

  server.route({
    method: 'GET',
    path: '/captured',
    handler: () => new Error('Captured error'),
  });

  // Runs BEFORE `server.start()` and installs the default predicate. The integration's
  // auto-registration (with the custom predicate) only fires at `server.start()`, so the custom
  // predicate must still take precedence over this earlier default-valued attach.
  await Sentry.setupHapiErrorHandler(server);

  await server.start();

  sendPortToRunner(server.info.port);
};

run();
