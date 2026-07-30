// <reference lib="deno.ns" />

import { assert } from 'https://deno.land/std@0.212.0/assert/assert.ts';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';

// A directly-constructed `DenoClient` (no `Sentry.init()`) is a supported path.
// The SDK's own tests use it. It must still install the AsyncLocalStorage
// context strategy, which the channel integrations depend on. We run it in a
// fresh process so no prior `init()` has installed the strategy already, then
// assert a nested mysql span appears (see scenario.mjs for why that proves the
// strategy was installed by `client.init()`).
Deno.test('DenoClient.init installs the AsyncLocalStorage strategy on the direct-construction path', async () => {
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

  assertEquals(code, 0, `scenario exited ${code}\nstdout:\n${out}\nstderr:\n${err}`);

  const line = out.split('\n').find(l => l.startsWith('SCENARIO')) ?? '';
  assert(line, `no SCENARIO line in output:\n${out}\nstderr:\n${err}`);
  assert(
    line.includes('nested=true'),
    `expected a nested mysql span via the direct client path (ACS must be installed by client.init), got: ${line}`,
  );
});
