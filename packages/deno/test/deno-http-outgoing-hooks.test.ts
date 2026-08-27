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

const calls: string[] = [];

Deno.test({
  name: 'denoHttpIntegration: runs outgoingRequestHook, outgoingResponseHook and outgoingRequestApplyCustomAttributes',
  async fn() {
    getMainCarrier().__SENTRY__ = undefined;

    const transactions: TransactionEvent[] = [];
    init({
      dsn: 'https://username@domain/123',
      tracesSampleRate: 1,
      traceLifecycle: 'static',
      beforeSendTransaction: (event: TransactionEvent) => {
        transactions.push(event);
        return null;
      },
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

    abortController.abort();
    await target.finished;

    const parent = transactions.find(t => t.transaction === 'parent');
    assertExists(parent, `expected a 'parent' transaction, got ${transactions.map(t => t.transaction).join(', ')}`);

    const httpClientSpan = parent!.spans?.find(s => s.op === 'http.client');
    assertExists(
      httpClientSpan,
      `expected an http.client child span, got ops: ${parent!.spans?.map(s => s.op).join(', ')}`,
    );

    assertEquals(httpClientSpan!.data?.['outgoingRequestHook'], 'GET');
    assertEquals(httpClientSpan!.data?.['outgoingResponseHook'], 200);
    assertEquals(httpClientSpan!.data?.['outgoingRequestApplyCustomAttributes'], 'GET:200');

    // The request hook fires first; the apply-custom-attributes hook fires last,
    // once both the request and the finished response are available.
    assertEquals(calls, ['outgoingRequestHook', 'outgoingResponseHook', 'outgoingRequestApplyCustomAttributes']);
  },
});
