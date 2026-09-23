// <reference lib="deno.ns" />

import { assert } from 'https://deno.land/std@0.212.0/assert/assert.ts';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';

Deno.test('the runtime hook leaves `require()` of JSON working', async () => {
  const scenario = new URL('./scenario.mjs', import.meta.url);

  // The package root — where `node_modules` (and thus `@sentry/deno`) resolves
  // for the spawned `deno run`.
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

  // Without the format fixup in `@sentry/server-runtime-injection` this exits 1
  // with `SyntaxError: Unexpected token ':'` from the JSON compiled as JS.
  assertEquals(code, 0, `scenario exited ${code}\nstdout:\n${out}\nstderr:\n${err}`);

  const line = out.split('\n').find(l => l.startsWith('SCENARIO')) ?? '';
  assert(line.includes('answer=42'), `expected the parsed JSON value, got: ${line}\nstderr:\n${err}`);
});
