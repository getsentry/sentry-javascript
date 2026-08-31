import { spawnSync } from 'child_process';
import { rmSync } from 'fs';
import { join } from 'path';
import { sentryEsbuildPlugin } from '@sentry/node/esbuild';
import { build } from 'esbuild';
import type { Plugin } from 'esbuild';
import { afterAll, describe, expect, test } from 'vitest';

// `@sentry/node` installs its diagnostics-channel instrumentation through a runtime module hook
// that ships in `@sentry/server-utils` and only works from `node_modules`. Bundling that package
// strips its vendored code transformer, so the SDK warns that auto-instrumentation is off.
//
// Using the Sentry bundler plugin is the supported alternative: instrumentation is injected at
// build time, the runtime hook is redundant, and the SDK must stay quiet.
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

  // The positive control. Without it the two tests above would still pass on a build where the SDK
  // never warns at all, which is the regression they are meant to catch. `dataloader` is left
  // external so it loads through Node's loader, which is where a stripped transformer actually
  // costs the user instrumentation.
  test('warns when an external instrumented dependency loads and no plugin ran', async () => {
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
    expect(stdout).toContain('DEP_LOADED');
    // Nothing instrumented `dataloader`, so the user has to be told.
    expect(sentryWarnings(stderr).join('\n')).toContain('@sentry/server-utils');
  });
});
