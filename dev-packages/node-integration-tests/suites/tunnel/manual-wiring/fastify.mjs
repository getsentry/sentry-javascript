import * as Sentry from '@sentry/node';
import { sendPortToRunner } from '@sentry-internal/node-integration-tests';
import Fastify from 'fastify';

Sentry.init({ dsn: process.env.SENTRY_DSN });

const app = Fastify();

app.addHook('onRequest', async (request, reply) => {
  const tunnelResponse = Sentry.handleTunnelRequestIfMatched(request.raw, reply.raw);
  if (tunnelResponse) {
    await tunnelResponse;
    return reply;
  }
});

app.get('/dsn', async () => process.env.SENTRY_DSN);

// The test's last request, so the runner only stops the scenario after every check.
app.get('/done', async () => {
  Sentry.captureMessage('done');
  return 'ok';
});

app.listen({ port: 0 }).then(() => {
  sendPortToRunner(app.server.address().port);
});
