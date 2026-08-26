import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { rollup } from 'rollup';
import type { Plugin } from 'rollup';
import { sentryRollupPlugin } from '../../src/rollup';

// Regression test for https://github.com/getsentry/sentry-javascript-bundler-plugins/issues/949:
// `disable-upload` used to inject the debug ID into the bundle only, leaving the emitted source map
// without one - so a manual `sentry-cli` upload afterwards produced artifacts that never symbolicate.
describe('sentryRollupPlugin with `sourcemaps.disable: "disable-upload"`', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-rollup-test-'));
    fs.mkdirSync(path.join(tmpDir, 'src'));
    fs.writeFileSync(path.join(tmpDir, 'src', 'index.js'), 'console.log("hello", Math.random());\n');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  async function build(sourcemap: boolean | 'hidden'): Promise<void> {
    const bundle = await rollup({
      input: path.join(tmpDir, 'src', 'index.js'),
      plugins: sentryRollupPlugin({
        telemetry: false,
        silent: true,
        sourcemaps: { disable: 'disable-upload' },
      }) as Plugin[],
    });

    await bundle.write({ dir: path.join(tmpDir, 'dist'), entryFileNames: 'bundle.js', sourcemap });
    await bundle.close();
  }

  function readDist(fileName: string): string {
    return fs.readFileSync(path.join(tmpDir, 'dist', fileName), 'utf8');
  }

  it.each([true, 'hidden'] as const)(
    'stamps the injected debug ID onto the emitted source map (sourcemap: %s)',
    async sourcemap => {
      await build(sourcemap);

      const debugId = readDist('bundle.js').match(/sentry-dbid-([0-9a-f-]{36})/)?.[1];
      expect(debugId).toBeDefined();

      expect(JSON.parse(readDist('bundle.js.map'))).toMatchObject({ debug_id: debugId, debugId });
    },
  );
});
