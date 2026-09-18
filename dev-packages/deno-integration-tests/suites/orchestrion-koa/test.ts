// <reference lib="deno.ns" />

import { tracingChannel } from 'node:diagnostics_channel';
import type { DenoClient } from '@sentry/deno';
import { init, startSpan } from '@sentry/deno';
import { assert } from 'https://deno.land/std@0.212.0/assert/assert.ts';
import { assertExists } from 'https://deno.land/std@0.212.0/assert/assert_exists.ts';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';
import { resetGlobals, transactionSink, withTimeout } from '../../src/index.ts';

Deno.test('koa instrumentation: included in default integrations (Deno 2.8.0+)', () => {
  resetGlobals();
  const client = init({ traceLifecycle: 'static', dsn: 'https://username@domain/123' }) as DenoClient;
  const names = client.getOptions().integrations.map(i => i.name);
  assert(names.includes('Koa'), `Koa should be in defaults, got ${names.join(', ')}`);
});

Deno.test('koa instrumentation: orchestrion:koa:use channel wraps middleware into a span', async () => {
  resetGlobals();
  const sink = transactionSink();
  init({
    traceLifecycle: 'static',
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    beforeSendTransaction: sink.beforeSendTransaction,
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

  const parent = await withTimeout(
    sink.waitFor(t => t.transaction === 'parent'),
    5000,
    "'parent' transaction",
  );

  const koaSpan = parent.spans?.find(s => s.op === 'middleware');
  assertExists(koaSpan, `expected a koa middleware child span, got ops: ${parent.spans?.map(s => s.op).join(', ')}`);
  assertEquals(koaSpan!.description, 'myMiddleware');
  assertEquals(koaSpan!.data?.['sentry.origin'], 'auto.http.koa');
});
