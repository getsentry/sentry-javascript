import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as esbuild from 'esbuild';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { sentryEsbuildPlugin } from '../../src/esbuild';

const DEBUG_ID_MARKER = /sentry-dbid-([0-9a-f-]{36})/;

describe('sourcemaps.disable: "disable-upload"', () => {
  let tmpDir: string;
  let entry: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-esbuild-disable-upload-'));
    entry = path.join(tmpDir, 'entry.js');
    fs.writeFileSync(entry, 'export const answer = 42;\nconsole.log(answer);\n');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('stamps the emitted source map with the debug ID injected into the bundle', async () => {
    const outDir = path.join(tmpDir, 'dist');

    await esbuild.build({
      entryPoints: [entry],
      bundle: true,
      sourcemap: true,
      outdir: outDir,
      absWorkingDir: tmpDir,
      plugins: [sentryEsbuildPlugin({ telemetry: false, sourcemaps: { disable: 'disable-upload' } })],
    });

    const bundle = fs.readFileSync(path.join(outDir, 'entry.js'), 'utf8');
    const map = JSON.parse(fs.readFileSync(path.join(outDir, 'entry.js.map'), 'utf8'));
    const debugId = bundle.match(DEBUG_ID_MARKER)?.[1];

    expect(debugId).toBeDefined();
    expect(map.debug_id).toBe(debugId);
    expect(map.debugId).toBe(debugId);
    expect(bundle).toContain(`//# debugId=${debugId}`);
  });

  it('does not stamp emitted source maps when uploading is enabled', async () => {
    const outDir = path.join(tmpDir, 'dist');

    await esbuild.build({
      entryPoints: [entry],
      bundle: true,
      sourcemap: true,
      outdir: outDir,
      absWorkingDir: tmpDir,
      // No auth token, so the upload itself is skipped with a warning.
      plugins: [sentryEsbuildPlugin({ telemetry: false })],
    });

    const bundle = fs.readFileSync(path.join(outDir, 'entry.js'), 'utf8');
    const map = JSON.parse(fs.readFileSync(path.join(outDir, 'entry.js.map'), 'utf8'));

    expect(map).not.toHaveProperty('debug_id');
    expect(bundle).not.toContain('//# debugId=');
  });

  it('stamps the bundle when the source map is inlined into the bundle', async () => {
    const outDir = path.join(tmpDir, 'dist');
    await esbuild.build({
      entryPoints: [entry],
      bundle: true,
      sourcemap: 'inline',
      outdir: outDir,
      absWorkingDir: tmpDir,
      plugins: [sentryEsbuildPlugin({ telemetry: false, sourcemaps: { disable: 'disable-upload' } })],
    });

    const bundle = fs.readFileSync(path.join(outDir, 'entry.js'), 'utf8');
    const debugId = bundle.match(DEBUG_ID_MARKER)?.[1];

    expect(debugId).toBeDefined();
    expect(bundle).toContain(`//# debugId=${debugId}`);
  });
});
