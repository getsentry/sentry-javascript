import * as Sentry from '@sentry/node';
import { sendPortToRunner } from '@sentry-internal/node-integration-tests';
import Fastify from 'fastify';

const app = Fastify();

let port;

app.get('/test-exception/:id', async request => {
  throw new Error(`This is an exception with id ${request.params.id}`);
});

app.get('/test-error-not-captured', async () => {
  throw new Error('This is an error that will not be captured');
});

Sentry.setupFastifyErrorHandler(app, {
  shouldHandleError: (_error, request, _reply) => {
    if (request.routeOptions?.url?.includes('/test-error-not-captured')) {
      // Errors from this path will not be captured by Sentry
      return false;
    }

    return true;
  },
});

const run = async () => {
  await app.listen({ port: 0, host: 'localhost' });
  port = app.server.address().port;
  sendPortToRunner(port);
};

run();
