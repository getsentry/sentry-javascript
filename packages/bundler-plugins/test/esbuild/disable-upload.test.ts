import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as esbuild from 'esbuild';
import { sentryEsbuildPlugin } from '../../src/esbuild';

// Regression test for https://github.com/getsentry/sentry-javascript-bundler-plugins/issues/949:
// `disable-upload` used to inject the debug ID into the bundle only, leaving the emitted source map
// without one - so a manual `sentry-cli` upload afterwards produced artifacts that never symbolicate.
describe('sentryEsbuildPlugin with `sourcemaps.disable: "disable-upload"`', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-esbuild-test-'));
    fs.mkdirSync(path.join(tmpDir, 'src'));
    fs.writeFileSync(path.join(tmpDir, 'src', 'index.js'), 'console.log("hello", Math.random());\n');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  async function build(sourcemap: boolean | 'external'): Promise<void> {
    await esbuild.build({
      entryPoints: [path.join(tmpDir, 'src', 'index.js')],
      outfile: path.join(tmpDir, 'dist', 'bundle.js'),
      bundle: true,
      sourcemap,
      plugins: [sentryEsbuildPlugin({ telemetry: false, silent: true, sourcemaps: { disable: 'disable-upload' } })],
    });
  }

  function readDist(fileName: string): string {
    return fs.readFileSync(path.join(tmpDir, 'dist', fileName), 'utf8');
  }

  // `external` is esbuild's equivalent of `hidden-source-map`: it emits the map but no
  // sourceMappingURL comment, so the `.map` sibling is the only way to find it.
  it.each([true, 'external'] as const)(
    'stamps the injected debug ID onto the emitted source map (sourcemap: %s)',
    async sourcemap => {
      await build(sourcemap);

      const debugId = readDist('bundle.js').match(/sentry-dbid-([0-9a-f-]{36})/)?.[1];
      expect(debugId).toBeDefined();

      expect(JSON.parse(readDist('bundle.js.map'))).toMatchObject({ debug_id: debugId, debugId });
    },
  );
});
