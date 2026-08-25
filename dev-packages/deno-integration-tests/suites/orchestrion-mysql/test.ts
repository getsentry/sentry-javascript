// <reference lib="deno.ns" />

import { tracingChannel } from 'node:diagnostics_channel';
import type { DenoClient } from '@sentry/deno';
import { init, startSpan } from '@sentry/deno';
import { assert } from 'https://deno.land/std@0.212.0/assert/assert.ts';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';
import { assertExists } from 'https://deno.land/std@0.212.0/assert/assert_exists.ts';
import { resetGlobals, transactionSink, withTimeout } from '../../src/index.ts';

Deno.test('mysql instrumentation: included in default integrations (Deno 2.8.0+)', () => {
  resetGlobals();
  const client = init({ traceLifecycle: 'static', dsn: 'https://username@domain/123' }) as DenoClient;
  const names = client.getOptions().integrations.map(i => i.name);
  assert(names.includes('Mysql'), `Mysql should be in defaults, got ${names.join(', ')}`);
});

// The orchestrion runtime hook (`@sentry/deno/import`) only works as a FIRST
// import inside the entry graph in Deno 2.8.0 through 2.8.2.
// TODO: revisit a `--import` or `--preload` approach once Deno 2.8.3 ships.
Deno.test('@sentry/deno/import: transforms mysql so it publishes the orchestrion channel', async () => {
  const scenario = new URL('./scenario.mjs', import.meta.url);

  // The package root — where `node_modules` (and thus `@sentry/deno` / `mysql`)
  // resolves for the spawned `deno run`.
  const cwd = new URL('../../', import.meta.url);

  const command = new Deno.Command('deno', {
    args: ['run', '--allow-all', scenario.pathname],
    cwd: cwd.pathname,
    stdout: 'piped',
    stderr: 'piped',
  });

  const { code, stdout, stderr } = await command.output();
  const out = new TextDecoder().decode(stdout);
  const err = new TextDecoder().decode(stderr);

  assertEquals(code, 0, `scenario exited ${code}\nstdout:\n${out}\nstderr:\n${err}`);

  const line = out.split('\n').find(l => l.startsWith('SCENARIO')) ?? '';
  assert(line, `no SCENARIO line in output:\n${out}\nstderr:\n${err}`);
  // The injected channel fired on `connection.query()`
  // proves mysql was transformed...
  assert(line.includes('events=start'), `expected channel 'start' event, got: ${line}`);
  // ...with the real SQL forwarded through the channel context.
  assert(line.includes('statement=SELECT 1 AS solution'), `expected forwarded SQL, got: ${line}`);
  // The runtime hook set its detection marker at boot.
  assert(line.includes('"runtime":["mysql"]'), `expected runtime marker, got: ${line}`);
});

Deno.test('mysql instrumentation: orchestrion:mysql:query channel produces a nested db span', async () => {
  resetGlobals();
  const sink = transactionSink();
  init({
    traceLifecycle: 'static',
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    beforeSendTransaction: sink.beforeSendTransaction,
  });

  const channel = tracingChannel('orchestrion:mysql:query');

  // The shared context object orchestrion reuses across the lifecycle events.
  // `arguments[0]` is the SQL; `self.config` is the mysql connection config.
  const ctx = {
    arguments: ['SELECT 1 AS solution'],
    self: { config: { host: '127.0.0.1', port: 3306, database: 'mydb', user: 'root' } },
  };

  // Callback-success order published by orchestrion's transform:
  // start → end → asyncStart → asyncEnd (the span closes on asyncEnd).
  // `start`/`asyncStart` go through `runStores` (not bare `publish`), exactly as the transform's
  // `wrapCallback` does — that's what activates the store the subscriber binds, so the span opens.
  startSpan({ name: 'parent', op: 'test' }, () => {
    channel.start.runStores(ctx, () => {
      channel.end.publish(ctx);
    });
    channel.asyncStart.runStores(ctx, () => {
      channel.asyncEnd.publish(ctx);
    });
  });

  const parent = await withTimeout(
    sink.waitFor(t => t.transaction === 'parent'),
    5000,
    "'parent' transaction",
  );

  const mysqlSpan = parent.spans?.find(s => s.op === 'db');
  assertExists(mysqlSpan, `expected a db child span, got ops: ${parent.spans?.map(s => s.op).join(', ')}`);
  assertEquals(mysqlSpan!.description, 'SELECT 1 AS solution');
  assertEquals(mysqlSpan!.data?.['db.system.name'], 'mysql');
  assertEquals(mysqlSpan!.data?.['db.query.text'], 'SELECT 1 AS solution');
  assertEquals(mysqlSpan!.data?.['server.address'], '127.0.0.1');
  assertEquals(mysqlSpan!.data?.['server.port'], 3306);
  assertEquals(mysqlSpan!.data?.['db.user'], 'root');
  assertEquals(mysqlSpan!.data?.['sentry.origin'], 'auto.db.mysql');
});
