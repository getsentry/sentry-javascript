// <reference lib="deno.ns" />

import * as http from 'node:http';
import type { TransactionEvent } from '@sentry/core';
import { assert } from 'https://deno.land/std@0.212.0/assert/assert.ts';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';
import { assertExists } from 'https://deno.land/std@0.212.0/assert/assert_exists.ts';
import type { DenoClient } from '../build/esm/index.js';
import { getCurrentScope, getGlobalScope, getIsolationScope, init, startSpan } from '../build/esm/index.js';
import {
  DENO_VERSION,
  HTTP_CLIENT_DIAGNOSTICS_CHANNEL_SUPPORTED,
  HTTP_SERVER_DIAGNOSTICS_CHANNEL_SUPPORTED,
} from '../build/esm/denoVersion.js';

function resetGlobals(): void {
  getCurrentScope().clear();
  getCurrentScope().setClient(undefined);
  getIsolationScope().clear();
  getGlobalScope().clear();
}

/**
 * `beforeSendTransaction` hook plus a `waitFor(predicate)` helper
 * resolves when a matching transaction arrives (or has already arrived)
 */
function transactionSink(): {
  transactions: TransactionEvent[];
  beforeSendTransaction: (event: TransactionEvent) => null;
  waitFor: (predicate: (event: TransactionEvent) => boolean) => Promise<TransactionEvent>;
} {
  const transactions: TransactionEvent[] = [];
  const waiters: { predicate: (e: TransactionEvent) => boolean; resolve: (e: TransactionEvent) => void }[] = [];
  return {
    transactions,
    beforeSendTransaction(event) {
      transactions.push(event);
      for (let i = waiters.length - 1; i >= 0; i--) {
        const w = waiters[i]!;
        if (w.predicate(event)) {
          waiters.splice(i, 1);
          w.resolve(event);
        }
      }
      return null;
    },
    waitFor(predicate) {
      const already = transactions.find(predicate);
      if (already) return Promise.resolve(already);
      return new Promise<TransactionEvent>(resolve => {
        waiters.push({ predicate, resolve });
      });
    },
  };
}

// Bind a promise so a real "never arrives" bug fails the test.
function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out waiting for ${what} after ${ms}ms`)), ms);
  });
  // Clear the timer on either resolution so Deno's leak detector is happy.
  return Promise.race([p, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

// Activation gate — split into two skip-mirrored tests so each run exercises
// exactly one assertion. CI on a supported Deno verifies inclusion; CI on an
// unsupported Deno verifies exclusion.
Deno.test({
  name: 'denoHttpIntegration: included in default integrations on Deno >= 2.7.13',
  ignore: !HTTP_CLIENT_DIAGNOSTICS_CHANNEL_SUPPORTED,
  fn() {
    resetGlobals();
    const client = init({ dsn: 'https://username@domain/123' }) as DenoClient;
    const names = client.getOptions().integrations.map(i => i.name);
    assert(
      names.includes('DenoHttp'),
      `DenoHttp should be a default integration on Deno ${DENO_VERSION.major}.${DENO_VERSION.minor}.${DENO_VERSION.patch}, got ${names.join(', ')}`,
    );
  },
});

Deno.test({
  name: 'denoHttpIntegration: NOT in default integrations on Deno < 2.7.13',
  ignore: HTTP_CLIENT_DIAGNOSTICS_CHANNEL_SUPPORTED,
  fn() {
    resetGlobals();
    const client = init({ dsn: 'https://username@domain/123' }) as DenoClient;
    const names = client.getOptions().integrations.map(i => i.name);
    assert(
      !names.includes('DenoHttp'),
      `DenoHttp should NOT be in defaults on Deno ${DENO_VERSION.major}.${DENO_VERSION.minor}.${DENO_VERSION.patch} (< 2.7.13), got ${names.join(', ')}`,
    );
  },
});

Deno.test({
  name: 'denoHttpIntegration: node:http incoming request creates an http.server transaction',
  ignore: !HTTP_SERVER_DIAGNOSTICS_CHANNEL_SUPPORTED,
  async fn() {
    resetGlobals();
    const sink = transactionSink();
    init({
      dsn: 'https://username@domain/123',
      tracesSampleRate: 1,
      beforeSendTransaction: sink.beforeSendTransaction,
    });

    const server = http.createServer((_req, res) => {
      res.end('ok');
    });
    const port: number = await new Promise(resolve => {
      server.listen(0, '127.0.0.1', () => {
        resolve((server.address() as { port: number }).port);
      });
    });

    const response = await fetch(`http://127.0.0.1:${port}/users/42?x=1`);
    assertEquals(await response.text(), 'ok');

    // Wait on the real completion signal (transaction event flowed through
    // beforeSendTransaction), not a fixed sleep. Bounded so a "never arrives"
    // regression fails the test instead of hanging.
    const txn = await withTimeout(
      sink.waitFor(t => t.contexts?.trace?.op === 'http.server'),
      5000,
      'http.server transaction',
    );

    await new Promise<void>(resolve => server.close(() => resolve()));

    assertEquals(txn.transaction, 'GET /users/42');
    assertEquals(txn.contexts?.trace?.data?.['http.method'], 'GET');
    assertEquals(txn.contexts?.trace?.data?.['http.response.status_code'], 200);
  },
});

Deno.test({
  name: 'denoHttpIntegration: node:http outgoing request creates a child http.client span',
  ignore: !HTTP_CLIENT_DIAGNOSTICS_CHANNEL_SUPPORTED,
  async fn() {
    resetGlobals();
    const sink = transactionSink();
    init({
      dsn: 'https://username@domain/123',
      tracesSampleRate: 1,
      beforeSendTransaction: sink.beforeSendTransaction,
    });

    // Use Deno.serve for the target so the test does not depend on the
    // node:http server side (which only works on Deno 2.8.0+).
    const abortController = new AbortController();
    let onListen: ((_: unknown) => void) | undefined;
    const listening = new Promise(resolve => (onListen = resolve));
    const target = Deno.serve(
      { port: 0, signal: abortController.signal, onListen, hostname: '127.0.0.1' },
      () => new Response('pong'),
    );
    await listening;
    const targetPort = target.addr.port;

    // Make the outgoing node:http request inside an explicit parent span so
    // the http.client child span has somewhere to attach and txn is captured
    await startSpan({ name: 'parent', op: 'test' }, async () => {
      await new Promise<void>((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port: targetPort, path: '/ping', method: 'GET' }, res => {
          res.on('data', () => {});
          res.on('end', () => resolve());
          res.on('error', reject);
        });
        req.on('error', reject);
        req.end();
      });
    });

    // Wait on the real completion signal
    // Note: Deno.serve's own http.server transaction may arrive first
    const parent = await withTimeout(
      sink.waitFor(t => t.transaction === 'parent'),
      5000,
      "'parent' transaction",
    );

    abortController.abort();
    await target.finished;

    const httpClientSpan = parent.spans?.find(s => s.op === 'http.client');
    assertExists(
      httpClientSpan,
      `expected an http.client child span, got ops: ${parent.spans?.map(s => s.op).join(', ')}`,
    );
    assertEquals(httpClientSpan!.data?.['http.method'], 'GET');
    assertEquals(httpClientSpan!.data?.['http.response.status_code'], 200);
  },
});
