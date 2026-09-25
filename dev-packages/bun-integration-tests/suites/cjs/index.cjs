const Sentry = require('@sentry/bun');
const { sendPortToRunner } = require('@sentry-internal/node-integration-tests');

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
});

const server = Bun.serve({
  port: 0,
  fetch() {
    throw new Error('This is a test error from a CommonJS Bun app');
  },
  error() {
    return new Response('Internal Server Error', { status: 500 });
  },
});

sendPortToRunner(server.port);
