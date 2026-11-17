import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as esbuild from 'esbuild';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { sentryEsbuildPlugin } from '../../src/esbuild';

describe('entry points without a default export', () => {
  let tmpDir: string;
  let entry: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-esbuild-entry-exports-'));
    entry = path.join(tmpDir, 'entry.js');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function build(logOverride?: Record<string, esbuild.LogLevel>): Promise<esbuild.BuildResult> {
    return esbuild.build({
      entryPoints: [entry],
      bundle: true,
      write: false,
      format: 'esm',
      logLevel: 'silent',
      absWorkingDir: tmpDir,
      logOverride,
      plugins: [sentryEsbuildPlugin({ telemetry: false, sourcemaps: { disable: 'disable-upload' } })],
    });
  }

  it.each([
    ['an ES module without exports', 'export {};'],
    ['an ES module with only named exports', 'export const answer = 42;'],
    ['a plain script', 'console.log("hello");'],
  ])('does not warn for %s', async (_name, source) => {
    fs.writeFileSync(entry, source);

    const result = await build();

    expect(result.warnings).toEqual([]);
    expect(result.outputFiles?.[0]?.text).toContain('_sentryDebugIds');
  });

  it('keeps named exports of the entry point', async () => {
    fs.writeFileSync(entry, 'export const answer = 42;');

    const result = await build();

    expect(result.warnings).toEqual([]);
    expect(result.outputFiles?.[0]?.text).toMatch(/export\s*{[^}]*answer[^}]*}/);
  });

  it('keeps a user-provided override for the same esbuild message', async () => {
    fs.writeFileSync(entry, 'export {};');

    await expect(build({ 'import-is-undefined': 'error' })).rejects.toThrow(
      /import-is-undefined|will always be undefined/,
    );
  });
});
