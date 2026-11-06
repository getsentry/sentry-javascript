import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as esbuild from 'esbuild';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { sentryEsbuildPlugin } from '../../src/esbuild';

const DEBUG_ID_MARKER = /sentry-dbid-([0-9a-f-]{36})/;

describe('rebuilds', () => {
  let tmpDir: string;
  let entry: string;
  let outDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-esbuild-rebuild-'));
    entry = path.join(tmpDir, 'entry.js');
    outDir = path.join(tmpDir, 'dist');
    fs.writeFileSync(entry, 'export const answer = 42;\nconsole.log(answer);\n');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function readDebugIds(): { bundle: string | undefined; map: unknown } {
    const bundle = fs.readFileSync(path.join(outDir, 'entry.js'), 'utf8');
    const map = JSON.parse(fs.readFileSync(path.join(outDir, 'entry.js.map'), 'utf8'));
    return { bundle: bundle.match(DEBUG_ID_MARKER)?.[1], map: map.debug_id };
  }

  it('injects a debug ID into every rebuild of a context', async () => {
    const context = await esbuild.context({
      entryPoints: [entry],
      bundle: true,
      sourcemap: true,
      outdir: outDir,
      absWorkingDir: tmpDir,
      plugins: [sentryEsbuildPlugin({ telemetry: false, sourcemaps: { disable: 'disable-upload' } })],
    });

    try {
      await context.rebuild();
      const first = readDebugIds();
      expect(first.bundle).toBeDefined();
      expect(first.map).toBe(first.bundle);

      fs.writeFileSync(entry, 'export const answer = 43;\nconsole.log(answer);\n');
      await context.rebuild();
      const second = readDebugIds();
      expect(second.bundle).toBeDefined();
      expect(second.map).toBe(second.bundle);
    } finally {
      await context.dispose();
    }
  });
});
