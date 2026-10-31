// <reference lib="deno.ns" />

import { getTunnelPath } from '@sentry/core';
import { flush, init, serveTunnelIntegration } from '@sentry/deno';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';
import { getSpanOp, resetGlobals, spanSink, withTimeout } from '../../src/index.ts';

const DSN = 'https://username@domain/123';

Deno.test('Deno.serve drops the server span of managed tunnel requests', async () => {
  resetGlobals();
  const sink = spanSink();

  init({
    dsn: DSN,
    tracesSampleRate: 1,
    // A meta-framework answers the tunnel requests, Deno only drops their server spans.
    integrations: [serveTunnelIntegration()],
    transport: sink.transport,
  });

  const abortController = new AbortController();
  let onListen: ((_: unknown) => void) | undefined;
  const listening = new Promise(resolve => (onListen = resolve));
  const server = Deno.serve({ port: 0, signal: abortController.signal, onListen }, () => new Response('app'));
  await listening;

  try {
    const baseUrl = `http://localhost:${server.addr.port}`;
    const anchorSpanPromise = withTimeout(
      sink.waitFor(span => getSpanOp(span) === 'http.server' && span.attributes['url.path']?.value === '/after-tunnel'),
      5_000,
      'segment span for /after-tunnel',
    );

    await (await fetch(`${baseUrl}${getTunnelPath(DSN)}`, { method: 'POST', body: 'envelope' })).text();
    await (await fetch(`${baseUrl}/after-tunnel`)).text();

    await flush();
    await anchorSpanPromise;
    assertEquals(
      sink.spans.filter(span => getSpanOp(span) === 'http.server').map(span => span.attributes['url.path']?.value),
      ['/after-tunnel'],
    );
  } finally {
    abortController.abort();
    await server.finished;
  }
});
