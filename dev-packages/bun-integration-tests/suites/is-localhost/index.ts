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

process.send?.(JSON.stringify({ event: 'READY', port: server.port }));
