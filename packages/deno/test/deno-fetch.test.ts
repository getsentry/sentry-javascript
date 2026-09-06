/// <reference lib="deno.ns" />

import type { Event, TransactionEvent } from '@sentry/core';
import { getMainCarrier } from '@sentry/core';
import { assert } from 'https://deno.land/std@0.212.0/assert/assert.ts';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';
import { assertExists } from 'https://deno.land/std@0.212.0/assert/assert_exists.ts';
import type { DenoClient } from '../build/esm/index.js';
import { captureMessage, init, startSpan } from '../build/esm/index.js';

function resetGlobals(): void {
  getMainCarrier().__SENTRY__ = undefined;
}

function withTimeout<T>(promise: Promise<T>, ms: number, description: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out waiting for ${description} after ${ms}ms`)), ms);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  });
}

Deno.test({
  name: 'fetchIntegration: included in default integrations',
  fn() {
    resetGlobals();
    const client = init({ dsn: 'https://username@domain/123' }) as DenoClient;
    const names = client.getOptions().integrations.map(integration => integration.name);

    assert(names.includes('Fetch'), `Fetch should be a default integration, got ${names.join(', ')}`);
  },
});

Deno.test({
  name: 'fetchIntegration: creates a child span, propagates trace headers, and preserves a single fetch breadcrumb',
  async fn() {
    resetGlobals();

    const abortController = new AbortController();
    let onListen: ((value: unknown) => void) | undefined;
    const listening = new Promise(resolve => (onListen = resolve));
    let receivedHeaders: Headers | undefined;
    const server = Deno.serve({ port: 0, signal: abortController.signal, onListen, hostname: '127.0.0.1' }, request => {
      receivedHeaders = request.headers;
      return new Response('ok');
    });
    await listening;

    try {
      const url = `http://127.0.0.1:${server.addr.port}/downstream`;
      let resolveTransaction: ((event: TransactionEvent) => void) | undefined;
      const transaction = new Promise<TransactionEvent>(resolve => (resolveTransaction = resolve));
      let resolveEvent: ((event: Event) => void) | undefined;
      const capturedEvent = new Promise<Event>(resolve => (resolveEvent = resolve));

      init({
        dsn: 'https://username@domain/123',
        tracesSampleRate: 1,
        traceLifecycle: 'static',
        tracePropagationTargets: [url],
        beforeSendTransaction(event) {
          if (event.transaction === 'parent') {
            resolveTransaction?.(event);
          }
          return null;
        },
        beforeSend(event) {
          resolveEvent?.(event);
          return null;
        },
      });

      await startSpan({ name: 'parent', op: 'test' }, async () => {
        const response = await fetch(url);
        assertEquals(await response.text(), 'ok');
      });

      const parent = await withTimeout(transaction, 5_000, 'parent transaction');
      const httpClientSpan = parent.spans?.find(span => span.op === 'http.client');
      assertExists(httpClientSpan);

      assertExists(receivedHeaders);
      const sentryTrace = receivedHeaders.get('sentry-trace');
      const baggage = receivedHeaders.get('baggage');
      assertExists(sentryTrace);
      assertExists(baggage);
      assertEquals(sentryTrace.split('-')[0], parent.contexts?.trace?.trace_id);
      assertEquals(sentryTrace.split('-')[1], httpClientSpan.span_id);
      assert(baggage.includes(`sentry-trace_id=${parent.contexts?.trace?.trace_id}`));

      captureMessage('capture fetch breadcrumb');
      const event = await withTimeout(capturedEvent, 5_000, 'event containing fetch breadcrumb');
      const fetchBreadcrumbs = event.breadcrumbs?.filter(
        breadcrumb => breadcrumb.category === 'fetch' && breadcrumb.data?.url === url,
      );
      assertEquals(fetchBreadcrumbs?.length, 1);
    } finally {
      abortController.abort();
      await server.finished;
    }
  },
});
