// <reference lib="deno.ns" />

import { assert } from 'https://deno.land/std@0.212.0/assert/assert.ts';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';

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

async function runInitScenario(...args: string[]): Promise<{ line: string; out: string; err: string }> {
  const scenario = new URL('./scenario-init.mjs', import.meta.url);
  const cwd = new URL('../../', import.meta.url);

  // Deno throws on a `process.env` read without permission. Grant only the
  // variable `mysql` itself reads, so any read by the SDK fails the run.
  const command = new Deno.Command('deno', {
    args: ['run', '--allow-read', '--allow-net', '--allow-env=READABLE_STREAM', scenario.pathname, ...args],
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
  return { line, out, err };
}

Deno.test('init(): transforms mysql imported after it', async () => {
  const { line, out, err } = await runInitScenario();
  assert(line.includes('events=start'), `expected channel 'start' event, got: ${line}`);
  assert(line.includes('"runtime":["mysql"]'), `expected runtime marker, got: ${line}`);
  assert(
    !`${out}${err}`.includes('No diagnostics-channel injection detected'),
    `unexpected missing-injection warning:\n${out}\n${err}`,
  );
});

Deno.test('init(): enableRuntimeChannelInjection: false skips the hook and warns', async () => {
  const { line, out, err } = await runInitScenario('disabled');
  assert(line.includes('events= '), `expected no channel events, got: ${line}`);
  assert(!line.includes('"runtime"'), `expected no runtime marker, got: ${line}`);
  assert(
    `${out}${err}`.includes('No diagnostics-channel injection detected'),
    `expected missing-injection warning:\n${out}\n${err}`,
  );
});
