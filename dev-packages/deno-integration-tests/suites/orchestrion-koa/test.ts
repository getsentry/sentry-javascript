// <reference lib="deno.ns" />

import { tracingChannel } from 'node:diagnostics_channel';
import type { DenoClient } from '@sentry/deno';
import { flush, init, startSpan } from '@sentry/deno';
import { assert } from 'https://deno.land/std@0.212.0/assert/assert.ts';
import { assertExists } from 'https://deno.land/std@0.212.0/assert/assert_exists.ts';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';
import { getSpanOp, resetGlobals, spanSink, withTimeout } from '../../src/index.ts';

Deno.test('koa instrumentation: included in default integrations (Deno 2.8.0+)', () => {
  resetGlobals();
  const client = init({ dsn: 'https://username@domain/123' }) as DenoClient;
  const names = client.getOptions().integrations.map(i => i.name);
  assert(names.includes('Koa'), `Koa should be in defaults, got ${names.join(', ')}`);
});

Deno.test('koa instrumentation: orchestrion:koa:use channel wraps middleware into a span', async () => {
  resetGlobals();
  const sink = spanSink();
  init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    transport: sink.transport,
  });

  function myMiddleware(_context: unknown, next: () => Promise<unknown>): Promise<unknown> {
    return next();
  }

  // Publishing `start` runs the subscriber, which patches `arguments[0]` in place.
  const ctx = { arguments: [myMiddleware] as unknown[] };
  tracingChannel('orchestrion:koa:use').start.publish(ctx);
  const wrappedMiddleware = ctx.arguments[0] as typeof myMiddleware;

  await startSpan({ name: 'parent', op: 'test' }, async () => {
    await wrappedMiddleware({}, () => Promise.resolve());
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

  const koaSpan = children.find(s => getSpanOp(s) === 'middleware');
  assertExists(koaSpan, `expected a koa middleware child span, got ops: ${children.map(s => getSpanOp(s)).join(', ')}`);
  assertEquals(koaSpan.name, 'myMiddleware');
  assertEquals(koaSpan.attributes['sentry.origin']?.value, 'auto.http.koa');
});
