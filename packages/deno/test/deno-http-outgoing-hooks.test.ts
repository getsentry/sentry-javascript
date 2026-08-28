// <reference lib="deno.ns" />

/**
 * Lives in its own file because `setupOnce` runs once per process
 * (`installedIntegrations` guards it) and the diagnostics channel
 * subscription is global. Deno gives each test file a fresh module graph,
 * so this is the only way to install `denoHttpIntegration` with the outgoing
 * request hooks after another file has installed it with the defaults.
 */

import * as http from 'node:http';
import type { TransactionEvent } from '@sentry/core';
import { getMainCarrier } from '@sentry/core';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';
import { assertExists } from 'https://deno.land/std@0.212.0/assert/assert_exists.ts';
import { denoHttpIntegration, init, startSpan } from '../build/esm/index.js';

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

const calls: string[] = [];

Deno.test({
  name: 'denoHttpIntegration: runs outgoingRequestHook, outgoingResponseHook and outgoingRequestApplyCustomAttributes',
  async fn() {
    getMainCarrier().__SENTRY__ = undefined;

    const sink = transactionSink();
    init({
      dsn: 'https://username@domain/123',
      tracesSampleRate: 1,
      traceLifecycle: 'static',
      beforeSendTransaction: sink.beforeSendTransaction,
      integrations: [
        denoHttpIntegration({
          outgoingRequestHook: (span, request) => {
            calls.push('outgoingRequestHook');
            span.setAttribute('outgoingRequestHook', request.method ?? 'unknown');
          },
          outgoingResponseHook: (span, response) => {
            calls.push('outgoingResponseHook');
            span.setAttribute('outgoingResponseHook', response.statusCode ?? 0);
          },
          outgoingRequestApplyCustomAttributes: (span, request, response) => {
            calls.push('outgoingRequestApplyCustomAttributes');
            span.setAttribute('outgoingRequestApplyCustomAttributes', `${request.method}:${response.statusCode}`);
          },
        }),
      ],
    });

    // Use Deno.serve for the target so this test does not depend on the
    // node:http server-side instrumentation.
    const abortController = new AbortController();
    let onListen: ((_: unknown) => void) | undefined;
    const listening = new Promise(resolve => (onListen = resolve));
    const target = Deno.serve(
      { port: 0, signal: abortController.signal, onListen, hostname: '127.0.0.1' },
      () => new Response('pong'),
    );
    await listening;
    const targetPort = target.addr.port;

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

    assertEquals(httpClientSpan!.data?.['outgoingRequestHook'], 'GET');
    assertEquals(httpClientSpan!.data?.['outgoingResponseHook'], 200);
    assertEquals(httpClientSpan!.data?.['outgoingRequestApplyCustomAttributes'], 'GET:200');

    // The request hook fires first; the apply-custom-attributes hook fires last,
    // once both the request and the finished response are available.
    assertEquals(calls, ['outgoingRequestHook', 'outgoingResponseHook', 'outgoingRequestApplyCustomAttributes']);
  },
});
