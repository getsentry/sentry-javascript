// <reference lib="deno.ns" />

/**
 * Lives in its own file because `setupOnce` runs once per process
 * (`installedIntegrations` guards it) and the diagnostics channel
 * subscription is global. Deno gives each test file a fresh module graph,
 * so this is the only way to install `denoHttpIntegration` with
 * `spans: false` after another file has installed it with the defaults.
 *
 * Both tests below share that single `spans: false` subscription.
 */

import * as http from 'node:http';
import type { TransactionEvent } from '@sentry/core';
import { getIsolationScope, getMainCarrier } from '@sentry/core';
import { assert } from 'https://deno.land/std@0.212.0/assert/assert.ts';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';
import { denoHttpIntegration, init, startSpan } from '../build/esm/index.js';

/**
 * `spans: false` must win over `tracesSampleRate: 1`, so tracing is on
 * everywhere except the HTTP integration. Without it the option would be
 * indistinguishable from tracing being off.
 */
function initWithSpansDisabled(transactions: TransactionEvent[]): void {
  getMainCarrier().__SENTRY__ = undefined;
  init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    traceLifecycle: 'static',
    integrations: [denoHttpIntegration({ spans: false })],
    beforeSendTransaction: (event: TransactionEvent) => {
      transactions.push(event);
      return null;
    },
  });
}

Deno.test({
  name: 'denoHttpIntegration: node:http outgoing request creates no http.client span when spans: false',
  async fn() {
    const transactions: TransactionEvent[] = [];
    initWithSpansDisabled(transactions);

    // Deno.serve for the target so this does not depend on the node:http
    // server instrumentation.
    const abortController = new AbortController();
    let onListen: ((_: unknown) => void) | undefined;
    const listening = new Promise(resolve => (onListen = resolve));
    // Captured so we can tell "spans were disabled" apart from "the client
    // was never instrumented at all" -- header injection survives spans: false.
    let sentryTraceHeader: string | null = null;
    const target = Deno.serve(
      { port: 0, signal: abortController.signal, onListen, hostname: '127.0.0.1' },
      (request: Request) => {
        sentryTraceHeader = request.headers.get('sentry-trace');
        return new Response('pong');
      },
    );
    await listening;

    await startSpan({ name: 'parent', op: 'test' }, async () => {
      await new Promise<void>((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port: target.addr.port, path: '/ping', method: 'GET' }, res => {
          res.on('data', () => {});
          res.on('end', () => resolve());
          res.on('error', reject);
        });
        req.on('error', reject);
        req.end();
      });
    });

    abortController.abort();
    await target.finished;

    // The parent span proves tracing itself is live, so an absent
    // http.client span is the option working rather than tracing being off.
    assert(sentryTraceHeader, 'expected an injected sentry-trace header, so the client was instrumented');
    const parent = transactions.find(t => t.transaction === 'parent');
    assert(parent, `expected the 'parent' transaction, got: ${transactions.map(t => t.transaction).join(', ')}`);
    const childOps = parent!.spans?.map(s => s.op) ?? [];
    assertEquals(
      childOps.includes('http.client'),
      false,
      `expected no http.client span, got ops: ${childOps.join(', ')}`,
    );
  },
});

Deno.test({
  name: 'denoHttpIntegration: node:http incoming request creates no http.server transaction when spans: false',
  async fn() {
    const transactions: TransactionEvent[] = [];
    initWithSpansDisabled(transactions);

    // Captured inside the handler so we can tell "spans were disabled" apart
    // from "the request was never instrumented at all".
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

    const response = await fetch(`http://127.0.0.1:${port}/users/42`);
    assertEquals(await response.text(), 'ok');
    await new Promise<void>(resolve => server.close(() => resolve()));

    // Request isolation still runs with spans off, so this proves the
    // instrumentation saw the request.
    assertEquals(isolatedTransactionName, 'GET /users/42');
    const ops = transactions.map(t => t.contexts?.trace?.op);
    assertEquals(ops.includes('http.server'), false, `expected no http.server transaction, got ops: ${ops.join(', ')}`);
  },
});
