// <reference lib="deno.ns" />

import { EventEmitter } from 'node:events';
import { tracingChannel } from 'node:diagnostics_channel';
import type { DenoClient } from '@sentry/deno';
import { init, startSpan } from '@sentry/deno';
import { assert } from 'https://deno.land/std@0.212.0/assert/assert.ts';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';
import { assertExists } from 'https://deno.land/std@0.212.0/assert/assert_exists.ts';
import { resetGlobals, transactionSink, withTimeout } from '../../src/index.ts';

Deno.test('express instrumentation: included in default integrations (Deno 2.8.0+)', () => {
  resetGlobals();
  const client = init({ traceLifecycle: 'static', dsn: 'https://username@domain/123' }) as DenoClient;
  const names = client.getOptions().integrations.map(i => i.name);
  assert(names.includes('Express'), `Express should be in defaults, got ${names.join(', ')}`);
});

Deno.test('express instrumentation: orchestrion:express:handle channel produces a nested middleware span', async () => {
  resetGlobals();
  const sink = transactionSink();
  init({
    traceLifecycle: 'static',
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    beforeSendTransaction: sink.beforeSendTransaction,
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

  const parent = await withTimeout(
    sink.waitFor(t => t.transaction === 'parent'),
    5000,
    "'parent' transaction",
  );

  const expressSpan = parent.spans?.find(s => s.op === 'middleware.express');
  assertExists(expressSpan, `expected a middleware.express span, got ops: ${parent.spans?.map(s => s.op).join(', ')}`);
  assertEquals(expressSpan!.description, 'myMiddleware');
  assertEquals(expressSpan!.data?.['express.name'], 'myMiddleware');
  assertEquals(expressSpan!.data?.['express.type'], 'middleware');
  assertEquals(expressSpan!.data?.['sentry.origin'], 'auto.http.express');
});
