// <reference lib="deno.ns" />

/**
 * Lives in its own file because `setupOnce` runs once per process
 * (`installedIntegrations` guards it) and the diagnostics channel
 * subscription is global. Deno gives each test file a fresh module graph,
 * so this is the only way to install `denoHttpIntegration` with
 * non-default options after `deno-http.test.ts` has installed it with
 * the defaults.
 */

import * as http from 'node:http';
import type { Envelope } from '@sentry/core';
import { forEachEnvelopeItem, getIsolationScope, getMainCarrier } from '@sentry/core';
import { assert } from 'https://deno.land/std@0.212.0/assert/assert.ts';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';
import { denoHttpIntegration, init } from '../build/esm/index.js';
import { makeTestTransport } from './transport.ts';

Deno.test({
  name: 'denoHttpIntegration: node:http incoming request records no session when sessions: false',
  async fn() {
    getMainCarrier().__SENTRY__ = undefined;

    const envelopes: Envelope[] = [];
    const client = init({
      dsn: 'https://username@domain/123',
      release: '1.0.0',
      integrations: [denoHttpIntegration({ sessions: false })],
      transport: makeTestTransport(envelope => {
        envelopes.push(envelope);
      }),
    });

    // Captured inside the handler so we can tell "sessions were disabled"
    // apart from "the request was never instrumented at all".
    let isolatedTransactionName: string | undefined;
    const server = http.createServer((_req, res) => {
      isolatedTransactionName = getIsolationScope().getScopeData().transactionName;
      res.end('ok');
    });
    const port: number = await new Promise(resolve => {
      server.listen(0, '127.0.0.1', () => {
        resolve((server.address() as { port: number }).port);
      });
    });

    const response = await fetch(`http://127.0.0.1:${port}/health`);
    assertEquals(await response.text(), 'ok');
    await new Promise<void>(resolve => server.close(() => resolve()));
    await client.flush(2_000);

    const itemTypes: string[] = [];
    for (const envelope of envelopes) {
      forEachEnvelopeItem(envelope, ([headers]) => {
        itemTypes.push(headers.type);
      });
    }

    assertEquals(isolatedTransactionName, 'GET /health');
    assert(!itemTypes.includes('sessions'), `expected no session envelope item, got: ${itemTypes.join(', ')}`);
    assert(!itemTypes.includes('session'), `expected no session envelope item, got: ${itemTypes.join(', ')}`);
  },
});
