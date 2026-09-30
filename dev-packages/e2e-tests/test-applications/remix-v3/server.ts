import * as Sentry from '@sentry/remix/v3';
import * as http from 'node:http';
import { createRequestListener } from 'remix/node-fetch-server';

import { router } from './app/router.ts';

Sentry.init({
  dsn: process.env.E2E_TEST_DSN,
  tunnel: 'http://localhost:3061/',
  tracesSampleRate: 1.0,
});

const port = process.env.PORT ? Number.parseInt(process.env.PORT, 10) : 3060;

const server = http.createServer(
  createRequestListener(request => {
    // Handled outside the router on purpose: the only hook that can see this is the listener's
    // `onError`, which is the case the router middleware cannot cover.
    if (new URL(request.url).pathname === '/plain-throw') {
      throw new Error('Plain handler failed');
    }
    return router.fetch(request);
  }),
);

server.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
