// <reference lib="deno.ns" />

import { channel } from 'node:diagnostics_channel';
import type { DenoClient } from '@sentry/deno';
import { init } from '@sentry/deno';
import { assert } from 'https://deno.land/std@0.212.0/assert/assert.ts';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';
import { assertExists } from 'https://deno.land/std@0.212.0/assert/assert_exists.ts';
import { errorSink, resetGlobals, withTimeout } from '../../src/index.ts';

Deno.test('fastify instrumentation: included in default integrations (Deno 2.8.0+)', () => {
  resetGlobals();
  const client = init({ traceLifecycle: 'static', dsn: 'https://username@domain/123' }) as DenoClient;
  const names = client.getOptions().integrations.map(i => i.name);
  assert(names.includes('Fastify'), `Fastify should be in defaults, got ${names.join(', ')}`);
});

Deno.test('fastify instrumentation: tracing:fastify.request.handler:error channel captures the error', async () => {
  resetGlobals();
  const sink = errorSink();
  init({
    traceLifecycle: 'static',
    dsn: 'https://username@domain/123',
    beforeSend: sink.beforeSend,
  });

  const error = new Error('fastify boom');

  // Fastify v5 publishes this native diagnostics channel when a request handler errors; the
  // integration subscribes to it directly (no orchestrion injection needed). A 5xx reply passes the
  // default `shouldHandleError`, so the error is captured.
  channel('tracing:fastify.request.handler:error').publish({
    error,
    request: { method: 'GET', routeOptions: { url: '/boom' } },
    reply: { statusCode: 500 },
  });

  const event = await withTimeout(
    sink.waitFor(e => e.exception?.values?.[0]?.value === 'fastify boom'),
    5000,
    "the captured 'fastify boom' error",
  );

  assertExists(event.exception?.values?.[0]);
  assertEquals(event.exception?.values?.[0]?.mechanism?.type, 'auto.function.fastify');
  assertEquals(event.exception?.values?.[0]?.mechanism?.handled, false);
});
