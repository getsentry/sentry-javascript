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
  createRequestListener(async request => {
    try {
      return await router.fetch(request);
    } catch {
      return new Response('Internal Server Error', { status: 500 });
    }
  }),
);

server.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
