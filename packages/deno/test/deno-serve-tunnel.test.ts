// <reference lib="deno.ns" />

import type { TransactionEvent } from '@sentry/core';
import { getMainCarrier, getTunnelPath } from '@sentry/core';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/mod.ts';
import { init } from '../build/esm/index.js';

const DSN = 'https://username@domain/123';

Deno.test('Deno.serve drops the server span of managed tunnel requests', async () => {
  getMainCarrier().__SENTRY__ = undefined;
  const transactions: string[] = [];

  init({
    dsn: DSN,
    tracesSampleRate: 1,
    traceLifecycle: 'static',
    // A meta-framework answers the tunnel requests, Deno only drops their server spans.
    tunnel: true,
    beforeSendTransaction: (event: TransactionEvent) => {
      transactions.push(event.request?.url ?? '');
      return null;
    },
  });

  const abortController = new AbortController();
  let onListen: ((_: unknown) => void) | undefined = undefined;
  const listening = new Promise(resolve => (onListen = resolve));
  const server = Deno.serve({ port: 0, signal: abortController.signal, onListen }, () => new Response('app'));
  await listening;

  const baseUrl = `http://localhost:${server.addr.port}`;
  const tunnelResponse = await fetch(`${baseUrl}${getTunnelPath(DSN)}`, { method: 'POST', body: 'envelope' });
  assertEquals(await tunnelResponse.text(), 'app');
  await (await fetch(`${baseUrl}/after-tunnel`)).text();

  abortController.abort();
  await server.finished;

  assertEquals(transactions.length, 1);
  assertEquals(transactions[0]?.endsWith('/after-tunnel'), true);
});
