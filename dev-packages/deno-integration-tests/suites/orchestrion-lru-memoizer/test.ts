// <reference lib="deno.ns" />

import { tracingChannel } from 'node:diagnostics_channel';
import type { Span } from '@sentry/core';
import type { DenoClient } from '@sentry/deno';
import { getActiveSpan, init, startSpan, startSpanManual } from '@sentry/deno';
import { assert } from 'https://deno.land/std@0.212.0/assert/assert.ts';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';
import { assertExists } from 'https://deno.land/std@0.212.0/assert/assert_exists.ts';
import { resetGlobals, transactionSink, withTimeout } from '../../src/index.ts';

Deno.test('lru-memoizer instrumentation: included in default integrations (Deno 2.8.0+)', () => {
  resetGlobals();
  const client = init({ traceLifecycle: 'static', dsn: 'https://username@domain/123' }) as DenoClient;
  const names = client.getOptions().integrations.map(i => i.name);
  assert(names.includes('LruMemoizer'), `LruMemoizer should be in defaults, got ${names.join(', ')}`);
});

// lru-memoizer creates no span of its own; it restores the caller's scope onto
// the memoized callback (which it fires from a detached `setImmediate`). We drive
// `start` while a parent span is active (capturing the caller's context), then
// drive `asyncStart` from a detached context where that span is NOT active — as
// happens when the callback fires later. Without the restore, work there starts a
// new trace; with it, the parent is active again and a span nests under it.
Deno.test('lru-memoizer instrumentation: restores the caller scope onto the memoized callback', async () => {
  resetGlobals();
  const sink = transactionSink();
  init({
    traceLifecycle: 'static',
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    beforeSendTransaction: sink.beforeSendTransaction,
  });

  const channel = tracingChannel('orchestrion:lru-memoizer:load');
  const ctx = { arguments: [] };

  let parentSpan: Span | undefined;
  // `startSpanManual` leaves the span open after the callback but deactivates it,
  // so the `asyncStart` below runs with no active span — a genuine detached context.
  startSpanManual({ name: 'parent', op: 'test', forceTransaction: true }, span => {
    parentSpan = span;
    channel.start.runStores(ctx, () => undefined);
  });

  // Detached: no active span here.
  assertEquals(getActiveSpan(), undefined);

  let restoredActive: Span | undefined;
  channel.asyncStart.runStores(ctx, () => {
    restoredActive = getActiveSpan();
    startSpan({ name: 'memoized-work', op: 'test' }, () => undefined);
  });
  channel.asyncEnd.publish(ctx);
  parentSpan!.end();

  // The callback saw the caller's span restored.
  assertEquals(restoredActive, parentSpan);

  const parent = await withTimeout(
    sink.waitFor(t => t.transaction === 'parent'),
    5000,
    "'parent' transaction",
  );

  // The span created in the restored callback nested under the caller, not a new trace.
  const child = parent.spans?.find(s => s.description === 'memoized-work');
  assertExists(
    child,
    `expected memoized-work nested under parent, got: ${parent.spans?.map(s => s.description).join(', ')}`,
  );
});
