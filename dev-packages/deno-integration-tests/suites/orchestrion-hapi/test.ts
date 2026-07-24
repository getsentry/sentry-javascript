// <reference lib="deno.ns" />

import { tracingChannel } from 'node:diagnostics_channel';
import type { DenoClient } from '@sentry/deno';
import { init, startSpan } from '@sentry/deno';
import { assert } from 'https://deno.land/std@0.212.0/assert/assert.ts';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';
import { assertExists } from 'https://deno.land/std@0.212.0/assert/assert_exists.ts';
import { resetGlobals, transactionSink, withTimeout } from '../../src/index.ts';

Deno.test('hapi instrumentation: included in default integrations (Deno 2.8.0+)', () => {
  resetGlobals();
  const client = init({ traceLifecycle: 'static', dsn: 'https://username@domain/123' }) as DenoClient;
  const names = client.getOptions().integrations.map(i => i.name);
  assert(names.includes('Hapi'), `Hapi should be in defaults, got ${names.join(', ')}`);
});

Deno.test('hapi instrumentation: orchestrion:@hapi/hapi:route channel wraps the route handler into a span', async () => {
  resetGlobals();
  const sink = transactionSink();
  init({
    traceLifecycle: 'static',
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    beforeSendTransaction: sink.beforeSendTransaction,
  });

  // `start` wraps the route's `handler` in place; the span opens when that
  // handler runs under an active span (as it does per request).
  const route = { method: 'get', path: '/hello', handler: (_req: unknown, _h: unknown) => 'ok' };
  const ctx = { arguments: [route] as unknown[], self: {} };
  tracingChannel('orchestrion:@hapi/hapi:route').start.publish(ctx);
  const wrappedRoute = ctx.arguments[0] as typeof route;

  startSpan({ name: 'parent', op: 'test' }, () => {
    wrappedRoute.handler({}, {});
  });

  const parent = await withTimeout(
    sink.waitFor(t => t.transaction === 'parent'),
    5000,
    "'parent' transaction",
  );

  const hapiSpan = parent.spans?.find(s => s.op === 'router.hapi');
  assertExists(hapiSpan, `expected a router.hapi span, got ops: ${parent.spans?.map(s => s.op).join(', ')}`);
  assertEquals(hapiSpan!.description, 'GET /hello');
  assertEquals(hapiSpan!.data?.['hapi.type'], 'router');
  assertEquals(hapiSpan!.data?.['http.route'], '/hello');
  assertEquals(hapiSpan!.data?.['sentry.origin'], 'auto.http.orchestrion.hapi');
});
