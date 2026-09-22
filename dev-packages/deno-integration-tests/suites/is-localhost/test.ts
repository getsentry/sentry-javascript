// <reference lib="deno.ns" />

import * as Sentry from '@sentry/deno';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';
import { resetGlobals, spanSink, withTimeout } from '../../src/index.ts';

Deno.test('Deno.serve sets sentry.is_localhost on every streamed span of the request', async () => {
  resetGlobals();
  const sink = spanSink();

  Sentry.init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    transport: sink.transport,
  });

  const abortController = new AbortController();
  let onListen: ((_: unknown) => void) | undefined;
  const listening = new Promise(resolve => (onListen = resolve));
  const server = Deno.serve({ port: 0, signal: abortController.signal, onListen }, () => {
    Sentry.startSpan({ name: 'child-span' }, () => {
      // noop
    });
    return new Response('OK');
  });
  await listening;

  const childPromise = withTimeout(
    sink.waitFor(span => span.name === 'child-span'),
    5_000,
    'child span',
  );
  const segmentPromise = withTimeout(
    sink.waitFor(span => span.attributes['sentry.op']?.value === 'http.server'),
    5_000,
    'http.server span',
  );

  const response = await fetch(`http://localhost:${server.addr.port}/test`);
  assertEquals(await response.text(), 'OK');

  const localhost = { value: true, type: 'boolean' };
  assertEquals((await segmentPromise).attributes['sentry.is_localhost'], localhost);
  assertEquals((await childPromise).attributes['sentry.is_localhost'], localhost);

  // The test's own outgoing `fetch` runs outside any request scope, so there is no request to
  // judge and it is correctly `false` — even though it happens to target localhost.
  const clientSpan = sink.spans().find(span => span.attributes['sentry.op']?.value === 'http.client');
  assertEquals(clientSpan?.attributes['sentry.is_localhost'], { value: false, type: 'boolean' });

  abortController.abort();
  await server.finished;
});
