// <reference lib="deno.ns" />

import type { ErrorEvent } from '@sentry/core';
import { getMainCarrier, getTunnelPath } from '@sentry/core';
import { assertEquals, assertObjectMatch } from 'https://deno.land/std@0.212.0/assert/mod.ts';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  EXPECTED_TUNNEL_OUTCOMES,
  runTunnelHardeningCases,
  startFakeIngests,
} from '../../../dev-packages/test-utils/src/tunnel-hardening.ts';
import { init, serveTunnelIntegration } from '../build/esm/index.js';

/**
 * Inits the SDK with a tunnel to every fake ingest, and returns the error events it reports.
 */
function initSdk(allowedDsns: string[]): ErrorEvent[] {
  getMainCarrier().__SENTRY__ = undefined;
  const events: ErrorEvent[] = [];
  init({
    dsn: 'https://username@domain/123',
    integrations: [serveTunnelIntegration({ allowedDsns })],
    beforeSend: event => {
      events.push(event);

      return null;
    },
  });

  return events;
}

/**
 * Answers `/health`, and the tunnel path like an app that handles it itself, which the runtime answers before it.
 */
function appStatus(pathname: string, tunnelPath: string): number {
  if (pathname === '/health') {
    return 200;
  }

  return pathname === tunnelPath ? 418 : 404;
}

async function expectAppUnharmed(
  port: number,
  ingests: Awaited<ReturnType<typeof startFakeIngests>>,
  events: ErrorEvent[],
  skip: string[] = [],
): Promise<void> {
  const results = await runTunnelHardeningCases({ port, ingests, getTunnelPath: dsn => getTunnelPath(dsn), skip });

  assertEquals(
    results.filter(result => result.health !== '200'),
    [],
  );
  assertObjectMatch(
    Object.fromEntries(results.map(result => [result.name, result.outcome])),
    Object.fromEntries(Object.entries(EXPECTED_TUNNEL_OUTCOMES).filter(([name]) => !skip.includes(name))),
  );
  // The tunnel reports nothing of its own to the app's project.
  assertEquals(events, []);
}

Deno.test('managed tunnel hardening: Deno.serve', async () => {
  const ingests = await startFakeIngests();
  const tunnelPath = getTunnelPath(ingests.dsn('ok'))!;
  const events = initSdk(ingests.allDsns());

  const abortController = new AbortController();
  let onListen: ((_: unknown) => void) | undefined = undefined;
  const listening = new Promise(resolve => (onListen = resolve));
  const server = Deno.serve({ port: 0, signal: abortController.signal, onListen }, request => {
    return new Response('app', { status: appStatus(new URL(request.url).pathname, tunnelPath) });
  });
  await listening;

  try {
    // `Deno.serve` resets a connection it answered before reading a large body, Sentry or not.
    await expectAppUnharmed(server.addr.port, ingests, events, ['rejected tunnel with a big unread body, then app']);
  } finally {
    abortController.abort();
    await server.finished;
    await ingests.close();
  }
});

Deno.test('managed tunnel hardening: node:http', async () => {
  const ingests = await startFakeIngests();
  const tunnelPath = getTunnelPath(ingests.dsn('ok'))!;
  const events = initSdk(ingests.allDsns());

  const server = http.createServer((request, response) => {
    response.writeHead(appStatus(request.url ?? '/', tunnelPath)).end('app');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));

  try {
    await expectAppUnharmed((server.address() as AddressInfo).port, ingests, events);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await ingests.close();
  }
});
