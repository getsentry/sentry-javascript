import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import webpack from 'webpack';
import type { Configuration } from 'webpack';
import { sentryWebpackPlugin } from '../../src/webpack/index';

// Regression test for https://github.com/getsentry/sentry-javascript-bundler-plugins/issues/949:
// `disable-upload` used to inject the debug ID into the bundle only, leaving the emitted source map
// without one - so a manual `sentry-cli` upload afterwards produced artifacts that never symbolicate.
describe('sentryWebpackPlugin with `sourcemaps.disable: "disable-upload"`', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-webpack-test-'));
    fs.mkdirSync(path.join(tmpDir, 'src'));
    // Needs a side effect, otherwise production mode tree-shakes the bundle down to nothing
    // and webpack emits no source map at all.
    fs.writeFileSync(path.join(tmpDir, 'src', 'index.js'), 'console.log("hello", Math.random());\n');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function build(config: Partial<Configuration>): Promise<void> {
    return new Promise((resolve, reject) => {
      webpack(
        {
          mode: 'production',
          entry: path.join(tmpDir, 'src', 'index.js'),
          output: { path: path.join(tmpDir, 'dist'), filename: 'bundle.js' },
          ...config,
        },
        (err, stats) => {
          if (err ?? stats?.hasErrors()) {
            reject(err ?? new Error(stats?.toString({ errorDetails: true })));
            return;
          }
          resolve();
        },
      );
    });
  }

  function readDist(fileName: string): string {
    return fs.readFileSync(path.join(tmpDir, 'dist', fileName), 'utf8');
  }

  function getInjectedDebugId(bundleSource: string): string {
    const match = bundleSource.match(/sentry-dbid-([0-9a-f-]{36})/);
    expect(match).not.toBeNull();
    return match![1]!;
  }

  it('stamps the injected debug ID onto the emitted source map', async () => {
    await build({
      devtool: 'hidden-source-map',
      plugins: [sentryWebpackPlugin({ telemetry: false, silent: true, sourcemaps: { disable: 'disable-upload' } })],
    });

    const debugId = getInjectedDebugId(readDist('bundle.js'));

    expect(JSON.parse(readDist('bundle.js.map'))).toMatchObject({ debug_id: debugId, debugId });
  });

  it('does not rewrite the emitted source map’s sources', async () => {
    await build({
      devtool: 'hidden-source-map',
      plugins: [sentryWebpackPlugin({ telemetry: false, silent: true, sourcemaps: { disable: 'disable-upload' } })],
    });

    // Unlike the throwaway copies the upload path prepares, the emitted map is a file the user keeps,
    // so its `sources` must stay exactly as the bundler wrote them.
    const { sources } = JSON.parse(readDist('bundle.js.map')) as { sources: string[] };
    expect(sources.every(source => source.startsWith('webpack://'))).toBe(true);
  });
});
