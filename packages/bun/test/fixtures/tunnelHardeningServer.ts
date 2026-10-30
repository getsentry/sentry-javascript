// The app `tunnelHardening.test.ts` runs in its own process: a client in the server's process stops getting timers
// while a tunnel route waits on a hung ingest.
import * as SentryCore from '@sentry/core';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { init, serveTunnelIntegration } from '../../src';

const tunnelPath = process.env.TUNNEL_PATH!;

init({
  dsn: 'https://username@domain/123',
  integrations: [serveTunnelIntegration({ allowedDsns: process.env.ALLOWED_DSNS!.split(',') })],
  beforeSend: event => {
    // The test fails on any of these.
    process.stdout.write(`EVENT ${JSON.stringify(event.exception?.values?.[0] ?? event.message)}\n`);

    return null;
  },
  transport: () =>
    SentryCore.createTransport({ recordDroppedEvent: () => undefined }, () => SentryCore.resolvedSyncPromise({})),
});

/**
 * Answers `/health`, and the tunnel path like an app that handles it itself, which the runtime answers before it.
 */
function appStatus(pathname: string): number {
  if (pathname === '/health') {
    return 200;
  }

  return pathname === tunnelPath ? 418 : 404;
}

/**
 * Prints the port for the test to read.
 */
function announce(port: number | undefined): void {
  process.stdout.write(`PORT ${port}\n`);
}

switch (process.env.SERVER) {
  case 'fetch':
    announce(
      Bun.serve({
        port: 0,
        fetch: request => new Response('app', { status: appStatus(new URL(request.url).pathname) }),
      }).port,
    );
    break;
  case 'routes':
    announce(
      Bun.serve({
        port: 0,
        routes: {
          '/health': new Response('ok'),
          // A static catch-all answers without running any JavaScript, like an SPA fallback.
          '/*': new Response('app catch-all', { status: 418 }),
        },
      }).port,
    );
    break;
  default: {
    const server = http.createServer((request, response) => {
      response.writeHead(appStatus(request.url ?? '/')).end('app');
    });
    server.listen(0, '127.0.0.1', () => announce((server.address() as AddressInfo).port));
  }
}
