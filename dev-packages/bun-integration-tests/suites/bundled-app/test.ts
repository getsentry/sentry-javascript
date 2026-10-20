import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, expect, test } from 'vitest';

// Outside the repo, so no `node_modules` is above the bundle, as in a deployed app.
const runDir = mkdtempSync(join(tmpdir(), 'sentry-bun-bundled-app-'));

afterAll(() => {
  rmSync(runDir, { recursive: true, force: true });
});

// Without `node_modules`, a module lookup starts Bun's auto-install, which exits the process when it
// cannot create its cache: https://github.com/getsentry/sentry-javascript/issues/25540
test('a bundled app initializes when Bun cannot create its package cache', () => {
  const app = join(runDir, 'app.mjs');
  execFileSync('bun', ['build', join(__dirname, 'index.ts'), '--target=bun', '--format=esm', `--outfile=${app}`]);
  // Files block the cache directories. Unlike file permissions, this also works for root.
  writeFileSync(join(runDir, 'node_modules'), '');
  writeFileSync(join(runDir, 'cache'), '');

  const result = spawnSync('bun', [app], {
    cwd: runDir,
    encoding: 'utf8',
    env: { ...process.env, BUN_INSTALL_CACHE_DIR: join(runDir, 'cache', 'bun') },
  });

  expect(result.stderr).not.toContain('unable to write files');
  expect(result.stdout).toContain('Sentry initialized');
  expect(result.status).toBe(0);
});
