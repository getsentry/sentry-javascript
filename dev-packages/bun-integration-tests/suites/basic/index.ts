import { sendPortToRunner } from '@sentry-internal/node-integration-tests';
import * as Sentry from '@sentry/bun';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
});

const server = Bun.serve({
  port: 0,
  fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/error') {
      throw new Error('This is a test error from the Bun integration tests');
    }

    return new Response('Hello from Bun!');
  },
  error(_err) {
    return new Response('Internal Server Error', { status: 500 });
  },
});

sendPortToRunner(server.port!);
