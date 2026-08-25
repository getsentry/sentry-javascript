import * as Sentry from '@sentry/bun';

// The target server the instrumented app makes outgoing fetch requests to. It
// echoes back the headers it received so the test can assert on trace propagation.
const targetServer = Bun.serve({
  port: 0,
  fetch(request) {
    const headers = Object.fromEntries(request.headers.entries());
    return Response.json({ headers });
  },
});

const targetUrl = `http://localhost:${targetServer.port}`;

Sentry.init({
  traceLifecycle: 'static',
  environment: 'production',
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
  // Only the `/allowed` path is a propagation target (matching is substring-based),
  // so requests to `/disallowed` below must NOT receive sentry-trace/baggage headers.
  tracePropagationTargets: [`${targetUrl}/allowed`],
});

const server = Bun.serve({
  port: 0,
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/outgoing-fetch') {
      const response = await fetch(`${targetUrl}/allowed`);
      const data = await response.json();
      return Response.json(data);
    }

    if (url.pathname === '/outgoing-fetch-disallowed') {
      const response = await fetch(`${targetUrl}/disallowed`);
      const data = await response.json();
      return Response.json(data);
    }

    return new Response('Hello from Bun!');
  },
});

process.send?.(JSON.stringify({ event: 'READY', port: server.port }));
