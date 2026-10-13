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

const run = async () => {
  await app.listen({ port: 0, host: 'localhost' });
  port = app.server.address().port;
  sendPortToRunner(port);
};

run();
