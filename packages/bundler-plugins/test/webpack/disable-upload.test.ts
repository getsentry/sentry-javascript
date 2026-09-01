import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { webpack } from 'webpack';
import type { Configuration, Stats } from 'webpack';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { sentryWebpackPlugin } from '../../src/webpack/index';

const DEBUG_ID_MARKER = /sentry-dbid-([0-9a-f-]{36})/;

function build(config: Configuration): Promise<Stats> {
  return new Promise((resolve, reject) => {
    webpack(config, (err, stats) => {
      if (err) {
        return reject(err);
      }
      if (!stats || stats.hasErrors()) {
        return reject(new Error(stats?.toString() ?? 'no stats'));
      }
      resolve(stats);
    });
  });
}

describe('sourcemaps.disable: "disable-upload"', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-webpack-disable-upload-'));
    fs.writeFileSync(path.join(tmpDir, 'entry.js'), 'export const answer = 42;\nconsole.log(answer);\n');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('stamps the emitted source map with the debug ID injected into the bundle', async () => {
    const outDir = path.join(tmpDir, 'dist');

    await build({
      mode: 'production',
      context: tmpDir,
      entry: './entry.js',
      devtool: 'source-map',
      output: { path: outDir, filename: 'bundle.js' },
      plugins: [sentryWebpackPlugin({ telemetry: false, sourcemaps: { disable: 'disable-upload' } })],
    });

    const bundle = fs.readFileSync(path.join(outDir, 'bundle.js'), 'utf8');
    const map = JSON.parse(fs.readFileSync(path.join(outDir, 'bundle.js.map'), 'utf8'));
    const debugId = bundle.match(DEBUG_ID_MARKER)?.[1];

    expect(debugId).toBeDefined();
    expect(map.debug_id).toBe(debugId);
    expect(map.debugId).toBe(debugId);
    expect(bundle).toContain(`//# debugId=${debugId}`);
  });

  it('stamps a hidden source map and keeps content-hashed file names consistent', async () => {
    const outDir = path.join(tmpDir, 'dist');

    await build({
      mode: 'production',
      context: tmpDir,
      entry: './entry.js',
      devtool: 'hidden-source-map',
      output: { path: outDir, filename: '[name].[contenthash].js' },
      plugins: [sentryWebpackPlugin({ telemetry: false, sourcemaps: { disable: 'disable-upload' } })],
    });

    const bundleFileName = fs.readdirSync(outDir).find(file => file.endsWith('.js'));
    expect(bundleFileName).toBeDefined();

    const bundle = fs.readFileSync(path.join(outDir, bundleFileName!), 'utf8');
    const map = JSON.parse(fs.readFileSync(path.join(outDir, `${bundleFileName}.map`), 'utf8'));
    const debugId = bundle.match(DEBUG_ID_MARKER)?.[1];

    expect(debugId).toBeDefined();
    expect(bundle).not.toContain('sourceMappingURL');
    expect(map.debug_id).toBe(debugId);
    expect(bundle).toContain(`//# debugId=${debugId}`);
    // The real content hash is recomputed after stamping, so the map's `file` must match the final name.
    expect(map.file).toBe(bundleFileName);
  });

  it('does not stamp emitted source maps when uploading is enabled', async () => {
    const outDir = path.join(tmpDir, 'dist');

    await build({
      mode: 'production',
      context: tmpDir,
      entry: './entry.js',
      devtool: 'source-map',
      output: { path: outDir, filename: 'bundle.js' },
      // No auth token, so the upload itself is skipped with a warning.
      plugins: [sentryWebpackPlugin({ telemetry: false })],
    });

    const bundle = fs.readFileSync(path.join(outDir, 'bundle.js'), 'utf8');
    const map = JSON.parse(fs.readFileSync(path.join(outDir, 'bundle.js.map'), 'utf8'));

    expect(map).not.toHaveProperty('debug_id');
    expect(bundle).not.toContain('//# debugId=');
  });

  it('stamps the bundle when the source map is inlined into the bundle', async () => {
    const outDir = path.join(tmpDir, 'dist');
    await build({
      mode: 'production',
      context: tmpDir,
      entry: './entry.js',
      devtool: 'inline-source-map',
      output: { path: outDir, filename: 'bundle.js' },
      plugins: [sentryWebpackPlugin({ telemetry: false, sourcemaps: { disable: 'disable-upload' } })],
    });

    const bundle = fs.readFileSync(path.join(outDir, 'bundle.js'), 'utf8');
    const debugId = bundle.match(DEBUG_ID_MARKER)?.[1];

    expect(debugId).toBeDefined();
    expect(bundle).toContain(`//# debugId=${debugId}`);
  });
});
