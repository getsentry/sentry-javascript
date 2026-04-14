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

    if (url.pathname === '/message') {
      Sentry.captureMessage('Hello from Bun');
      return new Response('OK');
    }

    return new Response('Hello from Bun!');
  },
  error(error) {
    Sentry.captureException(error);
    return new Response('Internal Server Error', { status: 500 });
  },
});

process.send?.(JSON.stringify({ event: 'READY', port: server.port }));
