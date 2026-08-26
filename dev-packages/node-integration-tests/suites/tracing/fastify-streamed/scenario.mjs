import { sendPortToRunner } from '@sentry-internal/node-integration-tests';
import Fastify from 'fastify';

const app = Fastify();

// The routes go through `register` so that they reach the SDK's `onRoute` hook.
// That hook is installed when Fastify flushes its plugin list, which is after
// routes registered directly on the root instance are already in place.
app.register(async instance => {
  instance.get(
    '/test-transaction/:id',
    {
      preHandler: function routePreHandler(_request, _reply, done) {
        done();
      },
    },
    async () => {
      return {};
    },
  );
});

const run = async () => {
  await app.listen({ port: 0, host: 'localhost' });
  sendPortToRunner(app.server.address().port);
};

run();
