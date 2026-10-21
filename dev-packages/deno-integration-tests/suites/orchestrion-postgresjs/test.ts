// <reference lib="deno.ns" />

import { tracingChannel } from 'node:diagnostics_channel';
import type { DenoClient } from '@sentry/deno';
import { flush, init, startSpan } from '@sentry/deno';
import { assert } from 'https://deno.land/std@0.212.0/assert/assert.ts';
import { assertExists } from 'https://deno.land/std@0.212.0/assert/assert_exists.ts';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';
import { getSpanOp, resetGlobals, spanSink, withTimeout } from '../../src/index.ts';

Deno.test('postgres.js instrumentation: included in default integrations (Deno 2.8.0+)', () => {
  resetGlobals();
  const client = init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
  }) as DenoClient;
  const names = client.getOptions().integrations.map(i => i.name);
  assert(names.includes('PostgresJs'), `PostgresJs should be in defaults, got ${names.join(', ')}`);
});

Deno.test('postgres.js instrumentation: orchestrion:postgres:handle channel produces a nested db span', async () => {
  resetGlobals();
  const sink = spanSink();
  init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    transport: sink.transport,
  });

  const channel = tracingChannel('orchestrion:postgres:handle');

  // `self` is the postgres.js `Query`; `strings` is its tagged-template SQL parts.
  // The span ends when postgres.js calls `query.resolve`, which the subscriber wraps.
  const query = {
    strings: ['SELECT name FROM users'],
    executed: false,
    resolve: (..._args: unknown[]) => undefined,
    reject: (..._args: unknown[]) => undefined,
  };
  const ctx = { self: query };

  startSpan({ name: 'parent', op: 'test' }, () => {
    // `start` creates the span and wraps `query.resolve`/`query.reject`.
    channel.start.runStores(ctx, () => undefined);
    // postgres.js signals completion by calling `resolve`; the wrapper ends the span.
    query.resolve({ command: 'SELECT' });
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

  const pgSpan = children.find(s => getSpanOp(s) === 'db');
  assertExists(pgSpan, `expected a db child span, got ops: ${children.map(s => getSpanOp(s)).join(', ')}`);
  assertEquals(pgSpan.name, 'SELECT users');
  assertEquals(pgSpan.attributes['db.system.name']?.value, 'postgres');
  assertEquals(pgSpan.attributes['db.query.text']?.value, 'SELECT name FROM users');
  // Set by the resolve wrapper from the `command` passed to `query.resolve`.
  assertEquals(pgSpan.attributes['db.operation.name']?.value, 'SELECT');
  assertEquals(pgSpan.attributes['sentry.origin']?.value, 'auto.db.postgresjs');
});
