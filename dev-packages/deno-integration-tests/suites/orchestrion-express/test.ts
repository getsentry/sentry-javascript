// <reference lib="deno.ns" />

import { EventEmitter } from 'node:events';
import { tracingChannel } from 'node:diagnostics_channel';
import type { DenoClient } from '@sentry/deno';
import { flush, init, startSpan } from '@sentry/deno';
import { assert } from 'https://deno.land/std@0.212.0/assert/assert.ts';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';
import { assertExists } from 'https://deno.land/std@0.212.0/assert/assert_exists.ts';
import { getSpanOp, resetGlobals, spanSink, withTimeout } from '../../src/index.ts';

Deno.test('express instrumentation: included in default integrations (Deno 2.8.0+)', () => {
  resetGlobals();
  const client = init({ dsn: 'https://username@domain/123' }) as DenoClient;
  const names = client.getOptions().integrations.map(i => i.name);
  assert(names.includes('Express'), `Express should be in defaults, got ${names.join(', ')}`);
});

Deno.test('express instrumentation: orchestrion:express:handle channel produces a nested middleware span', async () => {
  resetGlobals();
  const sink = spanSink();
  init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    transport: sink.transport,
  });

  const channel = tracingChannel('orchestrion:express:handle');

  // `self` is the routing layer; `arguments` are `[req, res, next]`. A 3-arg
  // handler that isn't a router or route-dispatch is traced as a middleware.
  const layer = { name: 'myMiddleware', handle: (_req: unknown, _res: unknown, _next: unknown) => undefined };
  const res = new EventEmitter();
  const ctx = { self: layer, arguments: [{}, res, () => undefined] };

  startSpan({ name: 'parent', op: 'test' }, () => {
    channel.start.runStores(ctx, () => undefined);
    channel.asyncStart.runStores(ctx, () => undefined);
    channel.asyncEnd.publish(ctx);
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

  const expressSpan = children.find(s => getSpanOp(s) === 'middleware');
  assertExists(
    expressSpan,
    `expected an express middleware span, got ops: ${children.map(s => getSpanOp(s)).join(', ')}`,
  );
  assertEquals(expressSpan.name, 'myMiddleware');
  assertEquals(expressSpan.attributes['express.name']?.value, 'myMiddleware');
  assertEquals(expressSpan.attributes['express.type']?.value, 'middleware');
  assertEquals(expressSpan.attributes['sentry.origin']?.value, 'auto.http.express');
});
