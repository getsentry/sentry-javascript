// <reference lib="deno.ns" />

import { assert } from 'https://deno.land/std@0.212.0/assert/assert.ts';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';
import type { DenoClient } from '../build/esm/index.js';
import { getCurrentScope, getGlobalScope, getIsolationScope, init } from '../build/esm/index.js';

function resetGlobals(): void {
  getCurrentScope().clear();
  getCurrentScope().setClient(undefined);
  getIsolationScope().clear();
  getGlobalScope().clear();
}

Deno.test('denoMysqlIntegration: included in default integrations (Deno 2.8.0+)', () => {
  resetGlobals();
  const client = init({ dsn: 'https://username@domain/123' }) as DenoClient;
  const names = client.getOptions().integrations.map(i => i.name);
  assert(names.includes('DenoMysql'), `DenoMysql should be in defaults, got ${names.join(', ')}`);
});

// The orchestrion runtime hook (`@sentry/deno/import`) only works as a FIRST
// import inside the entry graph in Deno 2.8.0 through 2.8.2.
// TODO: revisit a `--import` or `--preload` approach once Deno 2.8.3 ships.
Deno.test('@sentry/deno/import: transforms mysql so it publishes the orchestrion channel', async () => {
  const scenario = new URL('./orchestrion-mysql/scenario.mjs', import.meta.url);

  // packages/deno — where node_modules resolves
  const cwd = new URL('../', import.meta.url);

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
  assert(line.includes('"runtime":true'), `expected runtime marker, got: ${line}`);
});
