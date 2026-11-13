import { sendPortToRunner } from '@sentry-internal/node-integration-tests';
import * as Sentry from '@sentry/bun';

const targetServer = Bun.serve({
  port: 0,
  fetch(request) {
    return Response.json({ headers: Object.fromEntries(request.headers.entries()) });
  },
});

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: 'production',
  release: '1.0',
  tracesSampleRate: Number(process.env.TRACES_SAMPLE_RATE ?? '1'),
  traceLifecycle: process.env.TRACE_LIFECYCLE === 'static' ? 'static' : 'stream',
});

async function fetchAndEcho(): Promise<Response> {
  const response = await fetch(`http://localhost:${targetServer.port}/target`);
  const data = await response.json();
  Sentry.captureException(new Error('outgoing fetch done'));
  return Response.json(data);
}

const server = Bun.serve({
  port: 0,
  routes: {
    '/fetch/:id': fetchAndEcho,
  },
  fetch: fetchAndEcho,
});

sendPortToRunner(server.port!);
