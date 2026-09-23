import { sendPortToRunner } from '@sentry-internal/node-integration-tests';
import * as Sentry from '@sentry/bun';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
});

const server = Bun.serve({
  port: 0,
  fetch() {
    Sentry.startSpan({ name: 'child-span' }, () => {
      // noop
    });
    return new Response('Hello from Bun!');
  },
});

sendPortToRunner(server.port!);
