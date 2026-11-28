import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';

const fixtureDir = new URL('./fixtures/modules/', import.meta.url);

async function runFixture(permissions: string[]): Promise<unknown> {
  const { stdout, stderr, success } = await new Deno.Command(Deno.execPath(), {
    // `--no-lock` keeps Deno from rewriting the fixture lockfile.
    args: ['run', '--no-prompt', '--no-lock', ...permissions, new URL('main.ts', fixtureDir).pathname],
    cwd: fixtureDir.pathname,
    stdin: 'null',
  }).output();
  assertEquals(success, true, new TextDecoder().decode(stderr));
  return JSON.parse(new TextDecoder().decode(stdout).trim());
}

Deno.test('modulesIntegration reads deno.lock and package.json', async () => {
  assertEquals(await runFixture([`--allow-read=${fixtureDir.pathname}`]), {
    'left-pad': '^1.3.0',
    '@std/assert': '1.0.13',
    '@types/react-dom': '18.3.0',
    express: '4.21.2',
  });
});

Deno.test('modulesIntegration reads nothing without read permission', async () => {
  assertEquals(await runFixture([]), {});
});
