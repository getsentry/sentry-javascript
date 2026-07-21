import * as Sentry from '@sentry/node';
import { sendPortToRunner } from '@sentry-internal/node-integration-tests';
import Fastify from 'fastify';

const app = Fastify();

let port;

app.get(
  '/test-transaction',
  {
    preHandler: function routePreHandler(_request, _reply, done) {
      done();
    },
  },
  async () => {
    Sentry.startSpan({ name: 'test-span' }, () => {
      Sentry.startSpan({ name: 'child-span' }, () => {});
    });

    return {};
  },
);

app.get('/test-exception/:id', async request => {
  throw new Error(`This is an exception with id ${request.params.id}`);
});

app.get('/test-inbound-headers/:id', async request => {
  return { headers: request.headers, id: request.params.id };
});

app.get('/test-outgoing-fetch/:id', async request => {
  const response = await fetch(`http://localhost:${port}/test-inbound-headers/${request.params.id}`);
  return response.json();
});

const run = async () => {
  await app.listen({ port: 0, host: 'localhost' });
  port = app.server.address().port;
  sendPortToRunner(port);
};

run();
