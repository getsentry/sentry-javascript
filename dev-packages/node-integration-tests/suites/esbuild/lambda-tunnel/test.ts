import { spawnSync } from 'child_process';
import { copyFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { build } from 'esbuild';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const OUT_DIR = join(__dirname, 'tmp_build');
const BUNDLE = join(OUT_DIR, 'app.cjs');

function runOnLambda(bundle: string): { stdout: string; status: number | null } {
  // pnpm's `NODE_PATH` would resolve `@sentry/node` from anywhere, which a deployed bundle can't.
  const { NODE_PATH: _nodePath, ...env } = process.env;
  const result = spawnSync('node', [bundle], {
    encoding: 'utf-8',
    timeout: 10_000,
    env: { ...env, LAMBDA_TASK_ROOT: join(__dirname, 'task'), _HANDLER: 'index.handler' },
  });

  return { stdout: result.stdout, status: result.status };
}

describe('managed tunnel on Lambda with `@sentry/node` bundled to CJS by esbuild', () => {
  beforeAll(async () => {
    await build({
      entryPoints: [join(__dirname, 'app.mjs')],
      outfile: BUNDLE,
      platform: 'node',
      format: 'cjs',
      bundle: true,
      logLevel: 'silent',
    });
  });

  afterAll(() => {
    rmSync(OUT_DIR, { recursive: true, force: true });
  });

  test('answers tunnel requests when the shim is installed next to the bundle', () => {
    const { stdout, status } = runOnLambda(BUNDLE);

    expect(status).toBe(0);
    expect(stdout).toContain('ANSWERED_BY ingest');
  });

  test('leaves the handler alone, without crashing `init`, when the shim is not installed', () => {
    const deployDir = mkdtempSync(join(tmpdir(), 'sentry-lambda-bundle-'));
    const bundle = join(deployDir, 'app.cjs');
    copyFileSync(BUNDLE, bundle);

    try {
      const { stdout, status } = runOnLambda(bundle);

      expect(status).toBe(0);
      expect(stdout).toContain('ANSWERED_BY app');
    } finally {
      rmSync(deployDir, { recursive: true, force: true });
    }
  });
});
