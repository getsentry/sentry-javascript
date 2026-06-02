import { spawnSync } from 'child_process';
import { rmSync } from 'fs';
import { dirname, join } from 'path';
import { describe, expect, it } from 'vitest';

const dir = __dirname;

function runBun(args: string[]): { stdout: string; stderr: string; status: number | null } {
  const res = spawnSync('bun', args, { cwd: dir, encoding: 'utf8', timeout: 60_000 });
  return { stdout: res.stdout ?? '', stderr: res.stderr ?? '', status: res.status };
}

// Bun orchestrion instrumentation is BUILD-ONLY (`@sentry/bun/plugin` is a
// `Bun.build` plugin; there is no `bun run` preload).
//
// A `bun run` runtime plugin cannot instrument CommonJS dependencies like
// `mysql`: any module returned by a runtime `onLoad` plugin in Bun loses its
// CommonJS named exports
//
// When https://github.com/oven-sh/bun/pull/31770 lands, we can revisit an
// auto-load plugin for `bun run`.
describe('orchestrion mysql instrumentation (Bun)', () => {
  it('bundles `mysql` with the plugin, and the built output fires the mysql channel when run', () => {
    // Build the scenario with the orchestrion `bun build` plugin.
    const build = runBun(['run', join(dir, 'build.ts')]);
    expect(build.status, `build failed:\nstderr:\n${build.stderr}\nstdout:\n${build.stdout}`).toBe(0);

    const outfile = build.stdout.match(/BUILD_OK outfile=(.+)/)?.[1]?.trim();
    expect(outfile, `no outfile in build output:\n${build.stdout}`).toBeTruthy();

    try {
      // Run the built bundle. The bundled (transformed) `mysql` should publish
      // to the `orchestrion:mysql:query` channel when `connection.query()` is
      // called, and the plugin's banner should set the `bundler` marker at boot.
      const run = runBun(['run', outfile as string]);
      expect(run.status, `run failed:\nstderr:\n${run.stderr}\nstdout:\n${run.stdout}`).toBe(0);

      const line = run.stdout.split('\n').find(l => l.startsWith('SCENARIO')) ?? '';
      // channel `start` fired on `connection.query()`
      expect(line).toContain('events=start');
      // with the expected SQL
      expect(line).toContain('statement=SELECT 1 AS solution');
      // injected banner ran at bundle boot
      expect(line).toContain('"bundler":true');
    } finally {
      if (outfile) {
        rmSync(dirname(outfile), { recursive: true, force: true });
      }
    }
  });
});
