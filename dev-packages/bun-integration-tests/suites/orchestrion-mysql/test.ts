import { spawnSync } from 'child_process';
import { rmSync } from 'fs';
import { dirname, join } from 'path';
import { describe, expect, it } from 'vitest';
import { supports } from '../../../node-integration-tests/utils';

const dir = __dirname;

// Cap each `bun` subprocess. The test runs two of them sequentially, so its own
// timeout (see the `it(...)` below) must exceed `2 * SUBPROCESS_TIMEOUT_MS` —
// otherwise the suite's default `testTimeout` (20s) fails the test before these
// caps do, e.g. on a slow CI runner where the build+run legitimately takes >20s.
const SUBPROCESS_TIMEOUT_MS = 60_000;

function runBun(args: string[]): { stdout: string; stderr: string; status: number | null } {
  const res = spawnSync('bun', args, { cwd: dir, encoding: 'utf8', timeout: SUBPROCESS_TIMEOUT_MS });
  return { stdout: res.stdout ?? '', stderr: res.stderr ?? '', status: res.status };
}

describe('orchestrion mysql instrumentation (Bun)', () => {
  // Before Bun 1.4.6, a CommonJS module like `mysql` loses its named exports
  // when a runtime `onLoad` plugin returns it, so `bun run` cannot load it.
  it.runIf(supports({ bunMin: '1.4.6' }))(
    'fires the mysql channel in `bun run` with the `@sentry/bun/import` preload',
    () => {
      const run = runBun(['--preload', '@sentry/bun/import', join(dir, 'scenario.ts')]);
      expect(run.status, `run failed:\nstderr:\n${run.stderr}\nstdout:\n${run.stdout}`).toBe(0);

      const line = run.stdout.split('\n').find(l => l.startsWith('SCENARIO')) ?? '';
      expect(line).toContain('events=start');
      expect(line).toContain('statement=SELECT 1 AS solution');
      expect(line).toContain('"runtime":["mysql"]');
    },
    SUBPROCESS_TIMEOUT_MS,
  );

  it(
    'bundles `mysql` with the plugin, and the built output fires the mysql channel when run',
    () => {
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
        // the transformed module's injected snippet recorded it on the marker
        expect(line).toContain('"bundler":["mysql"]');
      } finally {
        if (outfile) {
          rmSync(dirname(outfile), { recursive: true, force: true });
        }
      }
      // Allow for both sequential `runBun` calls hitting their subprocess cap, so
      // the `spawnSync` timeouts — not Vitest's 20s default — are the binding limit.
    },
    2 * SUBPROCESS_TIMEOUT_MS,
  );
});
