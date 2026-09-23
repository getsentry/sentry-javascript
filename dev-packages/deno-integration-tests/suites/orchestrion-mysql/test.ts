// <reference lib="deno.ns" />

import { tracingChannel } from 'node:diagnostics_channel';
import type { DenoClient } from '@sentry/deno';
import { flush, init, startSpan } from '@sentry/deno';
import { assert } from 'https://deno.land/std@0.212.0/assert/assert.ts';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';
import { assertExists } from 'https://deno.land/std@0.212.0/assert/assert_exists.ts';
import { getSpanOp, resetGlobals, spanSink, withTimeout } from '../../src/index.ts';

Deno.test('mysql instrumentation: included in default integrations (Deno 2.8.0+)', () => {
  resetGlobals();
  const client = init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
  }) as DenoClient;
  const names = client.getOptions().integrations.map(i => i.name);
  assert(names.includes('Mysql'), `Mysql should be in defaults, got ${names.join(', ')}`);
});

// Covers the import form of the hook. The `--preload` form the README
// documents is covered by the `deno` E2E app.
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
  const sink = spanSink();
  init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    transport: sink.transport,
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

  const mysqlSpan = children.find(s => getSpanOp(s) === 'db');
  assertExists(mysqlSpan, `expected a db child span, got ops: ${children.map(s => getSpanOp(s)).join(', ')}`);
  assertEquals(mysqlSpan.name, 'SELECT');
  assertEquals(mysqlSpan.attributes['db.system.name']?.value, 'mysql');
  assertEquals(mysqlSpan.attributes['db.query.text']?.value, 'SELECT ? AS solution');
  assertEquals(mysqlSpan.attributes['server.address']?.value, '127.0.0.1');
  assertEquals(mysqlSpan.attributes['server.port']?.value, 3306);
  assertEquals(mysqlSpan.attributes['db.user']?.value, 'root');
  assertEquals(mysqlSpan.attributes['sentry.origin']?.value, 'auto.db.mysql');
});
