// <reference lib="deno.ns" />

import { tracingChannel } from 'node:diagnostics_channel';
import type { DenoClient } from '@sentry/deno';
import { flush, init, startSpan } from '@sentry/deno';
import { assert } from 'https://deno.land/std@0.212.0/assert/assert.ts';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';
import { assertExists } from 'https://deno.land/std@0.212.0/assert/assert_exists.ts';
import { getSpanOp, resetGlobals, spanSink, withTimeout } from '../../src/index.ts';

Deno.test('hapi instrumentation: included in default integrations (Deno 2.8.0+)', () => {
  resetGlobals();
  const client = init({ dsn: 'https://username@domain/123' }) as DenoClient;
  const names = client.getOptions().integrations.map(i => i.name);
  assert(names.includes('Hapi'), `Hapi should be in defaults, got ${names.join(', ')}`);
});

Deno.test('hapi instrumentation: orchestrion:@hapi/hapi:route channel wraps the route handler into a span', async () => {
  resetGlobals();
  const sink = spanSink();
  init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    transport: sink.transport,
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

  await flush();

  const parent = await withTimeout(
    sink.waitFor(span => span.is_segment && span.name === 'parent'),
    5000,
    "'parent' segment span",
  );
  const children = sink.spans.filter(span => span.parent_span_id === parent.span_id);
  assertEquals(children.length, 1);
  assertEquals(children[0]!.trace_id, parent.trace_id);
  assertEquals(children[0]!.is_segment, false);

  const hapiSpan = children.find(s => getSpanOp(s) === 'router');
  assertExists(hapiSpan, `expected a router span, got ops: ${children.map(s => getSpanOp(s)).join(', ')}`);
  assertEquals(hapiSpan.name, '/hello');
  assertEquals(hapiSpan.attributes['hapi.type']?.value, 'router');
  assertEquals(hapiSpan.attributes['http.route']?.value, '/hello');
  assertEquals(hapiSpan.attributes['sentry.origin']?.value, 'auto.http.hapi');
});
