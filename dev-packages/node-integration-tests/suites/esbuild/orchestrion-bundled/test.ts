import { spawnSync } from 'child_process';
import { rmSync } from 'fs';
import { join } from 'path';
import { sentryEsbuildPlugin } from '@sentry/node/esbuild';
import { build } from 'esbuild';
import type { Plugin } from 'esbuild';
import { afterAll, describe, expect, test } from 'vitest';

// `@sentry/node` installs its diagnostics-channel instrumentation through a runtime module hook
// that ships in `@sentry/server-runtime-injection`. Its vendored code transformer is in the same
// file as the hook, so esbuild keeps it when it bundles the package, and the hook still
// instruments dependencies that load through Node's loader.
//
// The Sentry bundler plugin injects instrumentation at build time instead. Then the runtime hook
// is redundant, and the SDK must stay quiet.
//
// The assertions are on "did the SDK warn", not on how it decided to, so this test does not pin
// one implementation of the check.
const OUT_DIR = join(__dirname, 'tmp_build');

/** Every always-on `[Sentry]` line the SDK printed at startup. */
function sentryWarnings(stderr: string): string[] {
  return stderr.split('\n').filter(line => line.startsWith('[Sentry]'));
}

/**
 * Keep debug-ID injection on — that is part of what the plugin normally does to a build, and it is
 * what rewrites the entry point — while skipping release creation and upload, so the test needs no
 * auth token and makes no network calls.
 */
function sentryPlugin(): Plugin {
  return sentryEsbuildPlugin({
    telemetry: false,
    release: { create: false },
    sourcemaps: { disable: 'disable-upload' },
  }) as Plugin;
}

function run(entry: string): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync('node', [entry], { encoding: 'utf-8' });
  return { stdout: result.stdout, stderr: result.stderr, status: result.status };
}

describe('esbuild + orchestrion build-time instrumentation', () => {
  afterAll(() => {
    rmSync(OUT_DIR, { recursive: true, force: true });
  });

  test('stays quiet when the Sentry esbuild plugin ran', async () => {
    const outfile = join(OUT_DIR, 'single', 'app.mjs');

    await build({
      entryPoints: [join(__dirname, 'app.mjs')],
      outfile,
      platform: 'node',
      format: 'esm',
      bundle: true,
      logLevel: 'silent',
      plugins: [sentryPlugin()],
    });

    const { stdout, stderr, status } = run(outfile);

    expect(status).toBe(0);
    // Build-time instrumentation is in place, so telling the user to set up build-time
    // instrumentation would be wrong.
    expect(sentryWarnings(stderr)).toEqual([]);
    expect(stdout).toContain('APP_STARTED');
  });

  test('stays quiet when the bundle is code-split and `init()` runs from a shared chunk', async () => {
    const splitDir = join(OUT_DIR, 'split');

    await build({
      entryPoints: [join(__dirname, 'entry-a.mjs'), join(__dirname, 'entry-b.mjs')],
      outdir: splitDir,
      platform: 'node',
      format: 'esm',
      bundle: true,
      splitting: true,
      logLevel: 'silent',
      plugins: [sentryPlugin()],
    });

    const { stdout, stderr, status } = run(join(splitDir, 'entry-a.js'));

    expect(status).toBe(0);
    expect(sentryWarnings(stderr)).toEqual([]);
    expect(stdout).toContain('APP_STARTED');
  });

  // `dataloader` is left external so it loads through Node's loader, where only the runtime hook
  // can instrument it.
  test('instruments an external dependency and stays quiet when no plugin ran', async () => {
    const outfile = join(OUT_DIR, 'no-plugin', 'app.mjs');

    await build({
      entryPoints: [join(__dirname, 'app-external-dep.mjs')],
      outfile,
      platform: 'node',
      format: 'esm',
      bundle: true,
      external: ['dataloader'],
      logLevel: 'silent',
    });

    const { stdout, stderr, status } = run(outfile);

    expect(status).toBe(0);
    expect(stdout).toContain('runtime=["dataloader"]');
    expect(sentryWarnings(stderr)).toEqual([]);
  });

  // The SDK's bundling warning tells the user to keep `@sentry/server-runtime-injection` external,
  // so that remedy has to work. External, the package loads from `node_modules`, instruments the
  // (also external) `dataloader`, and stays quiet.
  test('instruments the dependency and stays quiet when `@sentry/server-runtime-injection` is kept external', async () => {
    const outfile = join(OUT_DIR, 'external-server-runtime-injection', 'app.mjs');

    await build({
      entryPoints: [join(__dirname, 'app-external-dep.mjs')],
      outfile,
      platform: 'node',
      format: 'esm',
      bundle: true,
      external: ['dataloader', '@sentry/server-runtime-injection'],
      logLevel: 'silent',
    });

    const { stdout, stderr, status } = run(outfile);

    expect(status).toBe(0);
    // The runtime hook transformed `dataloader`, so it is recorded and there is nothing to warn about.
    expect(stdout).toContain('runtime=["dataloader"]');
    expect(sentryWarnings(stderr)).toEqual([]);
  });
});
