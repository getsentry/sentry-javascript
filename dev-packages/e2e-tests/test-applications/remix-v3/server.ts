import * as Sentry from '@sentry/remix/v3';
import * as http from 'node:http';
import { Readable } from 'node:stream';
import { createRequestListener } from 'remix/node-fetch-server';

import { router } from './app/router.ts';

Sentry.init({
  dsn: process.env.E2E_TEST_DSN,
  tunnel: 'http://localhost:3061/',
  integrations: process.env.E2E_TEST_TUNNEL ? [Sentry.serveTunnelIntegration()] : [],
  tracesSampleRate: 1.0,
});

const port = process.env.PORT ? Number.parseInt(process.env.PORT, 10) : 3060;

// The plain server variant serves the router without `createRequestListener`, so only the router middleware can
// answer the tunnel there.
const plainServer = !!process.env.E2E_TEST_PLAIN_SERVER;

function handle(request: Request): Response | Promise<Response> {
  // Handled outside the router on purpose: the only hook that can see this is the listener's
  // `onError`, which is the case the router middleware cannot cover.
  if (new URL(request.url).pathname === '/plain-throw') {
    throw new Error('Plain handler failed');
  }
  // The tunnel variant checks that the managed tunnel answers before code the app runs in front of its router. With
  // the plain server nothing runs ahead of this, so it would block the tunnel there.
  if (
    process.env.E2E_TEST_TUNNEL &&
    !plainServer &&
    request.method === 'POST' &&
    request.headers.get('x-app-auth') !== 'ok'
  ) {
    return new Response('blocked by the app before its router', { status: 403 });
  }
  return router.fetch(request);
}

/**
 * A bare `node:http` adapter for the fetch handler.
 */
function toNodeListener(handler: (request: Request) => Response | Promise<Response>): http.RequestListener {
  return async (req, res) => {
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
    const request = new Request(`http://localhost:${port}${req.url}`, {
      method: req.method,
      headers: req.headers as HeadersInit,
      body: hasBody ? (Readable.toWeb(req) as ReadableStream) : undefined,
      duplex: 'half',
    } as RequestInit);

    try {
      const response = await handler(request);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      res.writeHead(500).end();
    }
  };
}

const server = http.createServer(plainServer ? toNodeListener(handle) : createRequestListener(handle));

server.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
