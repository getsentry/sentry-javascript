/// <reference lib="deno.ns" />

import * as http from 'node:http';
import type { Envelope, SessionAggregates, TransactionEvent } from '@sentry/core';
import { forEachEnvelopeItem, getMainCarrier } from '@sentry/core';
import { assert } from 'https://deno.land/std@0.212.0/assert/assert.ts';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';
import { assertExists } from 'https://deno.land/std@0.212.0/assert/assert_exists.ts';
import type { DenoClient } from '../build/esm/index.js';
import { denoHttpIntegration, init, startSpan } from '../build/esm/index.js';
import { makeTestTransport } from './transport.ts';

function resetGlobals(): void {
  getMainCarrier().__SENTRY__ = undefined;
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

Deno.test({
  name: 'denoHttpIntegration: included in default integrations',
  fn() {
    resetGlobals();
    const client = init({ dsn: 'https://username@domain/123' }) as DenoClient;
    const names = client.getOptions().integrations.map(i => i.name);
    assert(names.includes('DenoHttp'), `DenoHttp should be a default integration, got ${names.join(', ')}`);
  },
});

Deno.test({
  name: 'denoHttpIntegration: node:http incoming request creates an http.server transaction',
  async fn() {
    resetGlobals();
    const sink = transactionSink();
    init({
      dsn: 'https://username@domain/123',
      tracesSampleRate: 1,
      beforeSendTransaction: sink.beforeSendTransaction,
      traceLifecycle: 'static',
    });

    const server = http.createServer((_req, res) => {
      res.end('ok');
    });
    const port: number = await new Promise(resolve => {
      server.listen(0, '127.0.0.1', () => {
        resolve((server.address() as { port: number }).port);
      });
    });

    const response = await fetch(`http://127.0.0.1:${port}/users/42?x=1`, { method: 'QUERY' });
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

    assertEquals(txn.transaction, 'QUERY /users/42');
    assertEquals(txn.contexts?.trace?.data?.['http.request.method'], 'QUERY');
    assertEquals(txn.contexts?.trace?.data?.['http.response.status_code'], 200);
    assertEquals(txn.contexts?.trace?.data?.['network.protocol.name'], 'http');
    assertEquals(txn.contexts?.trace?.data?.['network.protocol.version'], '1.1');
  },
});

Deno.test({
  name: 'denoHttpIntegration: node:http incoming request records a release-health session by default',
  async fn() {
    resetGlobals();
    const envelopes: Envelope[] = [];
    const client = init({
      dsn: 'https://username@domain/123',
      release: '1.0.0',
      transport: makeTestTransport(envelope => {
        envelopes.push(envelope);
      }),
    });

    const server = http.createServer((_req, res) => {
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

    let sessionAggregates: SessionAggregates | undefined;
    for (const envelope of envelopes) {
      forEachEnvelopeItem(envelope, item => {
        const [headers, body] = item;
        if (headers.type === 'sessions') {
          sessionAggregates = body as SessionAggregates;
        }
      });
    }

    assertExists(sessionAggregates);
    assertEquals(sessionAggregates.attrs?.release, '1.0.0');
    assertEquals(sessionAggregates.aggregates.length, 1);
    assertEquals(sessionAggregates.aggregates[0]?.exited, 1);
    assertEquals(sessionAggregates.aggregates[0]?.errored, 0);
    assertEquals(sessionAggregates.aggregates[0]?.crashed, 0);
  },
});

Deno.test({
  name: 'denoHttpIntegration: node:http outgoing request creates a child http.client span',
  async fn() {
    resetGlobals();
    const sink = transactionSink();
    init({
      dsn: 'https://username@domain/123',
      tracesSampleRate: 1,
      beforeSendTransaction: sink.beforeSendTransaction,
      traceLifecycle: 'static',
    });

    // Use Deno.serve for the target so this client test does not depend on
    // the node:http server-side instrumentation.
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
        const req = http.request({ host: '127.0.0.1', port: targetPort, path: '/ping', method: 'QUERY' }, res => {
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
    assertEquals(httpClientSpan!.data?.['http.request.method'], 'QUERY');
    assertEquals(httpClientSpan!.data?.['http.response.status_code'], 200);
  },
});

/** Start a node:http server that echoes the status code named by the path, e.g. `/404`. */
async function startStatusServer(): Promise<{ port: number; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    res.statusCode = Number(req.url?.replace('/', '')) || 200;
    res.end('ok');
  });
  const port: number = await new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      resolve((server.address() as { port: number }).port);
    });
  });
  return { port, close: () => new Promise<void>(resolve => server.close(() => resolve())) };
}

Deno.test({
  name: 'denoHttpIntegration: drops transactions with a default-ignored status code',
  async fn() {
    resetGlobals();
    const sink = transactionSink();
    init({
      dsn: 'https://username@domain/123',
      tracesSampleRate: 1,
      beforeSendTransaction: sink.beforeSendTransaction,
      traceLifecycle: 'static',
    });

    const { port, close } = await startStatusServer();

    // 404 is in the default ignore list, 200 is not. Request the ignored one
    // first so that, by the time the 200 lands, the 404 has had its chance.
    assertEquals(await (await fetch(`http://127.0.0.1:${port}/404`)).text(), 'ok');
    assertEquals(await (await fetch(`http://127.0.0.1:${port}/200`)).text(), 'ok');

    const kept = await withTimeout(
      sink.waitFor(t => t.contexts?.trace?.data?.['http.response.status_code'] === 200),
      5000,
      'http.server transaction for the 200 response',
    );

    await close();

    assertEquals(kept.transaction, 'GET /200');
    // The shared handling also lifts the status onto the top-level `response` context.
    assertEquals(kept.contexts?.response?.status_code, 200);

    const dropped = sink.transactions.filter(t => t.contexts?.trace?.data?.['http.response.status_code'] === 404);
    assertEquals(dropped.length, 0, `expected the 404 transaction to be dropped, got ${dropped.length}`);
  },
});

Deno.test({
  name: 'denoServeIntegration: drops Deno.serve transactions with a default-ignored status code',
  async fn() {
    resetGlobals();
    const sink = transactionSink();
    init({
      dsn: 'https://username@domain/123',
      tracesSampleRate: 1,
      beforeSendTransaction: sink.beforeSendTransaction,
      traceLifecycle: 'static',
    });

    const abortController = new AbortController();
    let onListen: ((_: unknown) => void) | undefined;
    const listening = new Promise(resolve => (onListen = resolve));
    const server = Deno.serve(
      { port: 0, signal: abortController.signal, onListen, hostname: '127.0.0.1' },
      request => new Response('ok', { status: new URL(request.url).pathname === '/gone' ? 404 : 200 }),
    );
    await listening;
    const port = server.addr.port;

    assertEquals(await (await fetch(`http://127.0.0.1:${port}/gone`)).text(), 'ok');
    assertEquals(await (await fetch(`http://127.0.0.1:${port}/ok`)).text(), 'ok');

    const kept = await withTimeout(
      sink.waitFor(t => t.contexts?.trace?.data?.['http.response.status_code'] === 200),
      5000,
      'Deno.serve transaction for the 200 response',
    );

    abortController.abort();
    await server.finished;

    // `denoServeIntegration` owns this filtering via its own `ignoreStatusCodes`.
    assertEquals(kept.contexts?.trace?.origin, 'auto.http.deno');
    assertEquals(kept.contexts?.response?.status_code, 200);

    const dropped = sink.transactions.filter(t => t.contexts?.trace?.data?.['http.response.status_code'] === 404);
    assertEquals(dropped.length, 0, `expected the 404 Deno.serve transaction to be dropped, got ${dropped.length}`);
  },
});

Deno.test({
  name: 'denoHttpIntegration: ignoreStatusCodes does not cross-talk with Deno.serve transactions',
  async fn() {
    resetGlobals();
    const sink = transactionSink();
    init({
      dsn: 'https://username@domain/123',
      tracesSampleRate: 1,
      beforeSendTransaction: sink.beforeSendTransaction,
      traceLifecycle: 'static',
      // Ask DenoHttp to drop 200s. DenoServe keeps its own defaults, so `Deno.serve`
      // 200s must survive -- the two integrations no longer share a filter.
      integrations: [denoHttpIntegration({ ignoreStatusCodes: [200] })],
    });

    const abortController = new AbortController();
    let onListen: ((_: unknown) => void) | undefined;
    const listening = new Promise(resolve => (onListen = resolve));
    const server = Deno.serve(
      { port: 0, signal: abortController.signal, onListen, hostname: '127.0.0.1' },
      () => new Response('ok'),
    );
    await listening;
    const port = server.addr.port;

    assertEquals(await (await fetch(`http://127.0.0.1:${port}/ok`)).text(), 'ok');

    const kept = await withTimeout(
      sink.waitFor(t => t.contexts?.trace?.origin === 'auto.http.deno'),
      5000,
      'Deno.serve transaction unaffected by DenoHttp ignoreStatusCodes',
    );

    abortController.abort();
    await server.finished;

    assertEquals(kept.contexts?.trace?.data?.['http.response.status_code'], 200);
  },
});

Deno.test({
  name: 'denoHttpIntegration: ignoreStatusCodes overrides the default list',
  async fn() {
    resetGlobals();
    const sink = transactionSink();
    init({
      dsn: 'https://username@domain/123',
      tracesSampleRate: 1,
      beforeSendTransaction: sink.beforeSendTransaction,
      traceLifecycle: 'static',
      integrations: [denoHttpIntegration({ ignoreStatusCodes: [500] })],
    });

    const { port, close } = await startStatusServer();

    assertEquals(await (await fetch(`http://127.0.0.1:${port}/500`)).text(), 'ok');
    assertEquals(await (await fetch(`http://127.0.0.1:${port}/404`)).text(), 'ok');

    // 404 is no longer ignored once the default list is replaced.
    const kept = await withTimeout(
      sink.waitFor(t => t.contexts?.trace?.data?.['http.response.status_code'] === 404),
      5000,
      'http.server transaction for the 404 response',
    );

    await close();

    assertEquals(kept.transaction, 'GET /404');

    const dropped = sink.transactions.filter(t => t.contexts?.trace?.data?.['http.response.status_code'] === 500);
    assertEquals(dropped.length, 0, `expected the 500 transaction to be dropped, got ${dropped.length}`);
  },
});
