// <reference lib="deno.ns" />

import { tracingChannel } from 'node:diagnostics_channel';
import type { DenoClient } from '@sentry/deno';
import { init, startSpan } from '@sentry/deno';
import { assert } from 'https://deno.land/std@0.212.0/assert/assert.ts';
import { assertExists } from 'https://deno.land/std@0.212.0/assert/assert_exists.ts';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';
import { resetGlobals, transactionSink, withTimeout } from '../../src/index.ts';

Deno.test('postgres.js instrumentation: included in default integrations (Deno 2.8.0+)', () => {
  resetGlobals();
  const client = init({ traceLifecycle: 'static', dsn: 'https://username@domain/123' }) as DenoClient;
  const names = client.getOptions().integrations.map(i => i.name);
  assert(names.includes('PostgresJs'), `PostgresJs should be in defaults, got ${names.join(', ')}`);
});

Deno.test('postgres.js instrumentation: orchestrion:postgres:handle channel produces a nested db span', async () => {
  resetGlobals();
  const sink = transactionSink();
  init({
    traceLifecycle: 'static',
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    beforeSendTransaction: sink.beforeSendTransaction,
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

  const parent = await withTimeout(
    sink.waitFor(t => t.transaction === 'parent'),
    5000,
    "'parent' transaction",
  );

  const pgSpan = parent.spans?.find(s => s.op === 'db');
  assertExists(pgSpan, `expected a db child span, got ops: ${parent.spans?.map(s => s.op).join(', ')}`);
  assertEquals(pgSpan!.description, 'SELECT name FROM users');
  assertEquals(pgSpan!.data?.['db.system.name'], 'postgres');
  assertEquals(pgSpan!.data?.['db.query.text'], 'SELECT name FROM users');
  // Set by the resolve wrapper from the `command` passed to `query.resolve`.
  assertEquals(pgSpan!.data?.['db.operation.name'], 'SELECT');
  assertEquals(pgSpan!.data?.['sentry.origin'], 'auto.db.orchestrion.postgresjs');
});
