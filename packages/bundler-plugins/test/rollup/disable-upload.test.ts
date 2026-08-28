import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { rollup } from 'rollup';
import { rolldown } from 'rolldown';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sentryRollupPlugin } from '../../src/rollup';
import { sentryVitePlugin } from '../../src/vite';

const DEBUG_ID_MARKER = /sentry-dbid-([0-9a-f-]{36})/;

describe('sourcemaps.disable: "disable-upload"', () => {
  let tmpDir: string;
  let entry: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-rollup-disable-upload-'));
    entry = path.join(tmpDir, 'entry.js');
    fs.writeFileSync(entry, 'export const answer = 42;\nconsole.log(answer);\n');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('stamps the emitted source map with the debug ID injected into the chunk (rollup)', async () => {
    const outDir = path.join(tmpDir, 'dist');
    const build = await rollup({
      input: entry,
      plugins: [sentryRollupPlugin({ telemetry: false, sourcemaps: { disable: 'disable-upload' } })],
    });
    await build.write({ dir: outDir, sourcemap: true });

    const chunk = fs.readFileSync(path.join(outDir, 'entry.js'), 'utf8');
    const map = JSON.parse(fs.readFileSync(path.join(outDir, 'entry.js.map'), 'utf8'));
    const debugId = chunk.match(DEBUG_ID_MARKER)?.[1];

    expect(debugId).toBeDefined();
    expect(map.debug_id).toBe(debugId);
    expect(map.debugId).toBe(debugId);
    expect(chunk).toContain(`//# debugId=${debugId}`);
  });

  it('stamps the emitted source map with the debug ID injected into the chunk (rolldown / vite)', async () => {
    const outDir = path.join(tmpDir, 'dist');
    const build = await rolldown({
      input: entry,
      plugins: sentryVitePlugin({ telemetry: false, sourcemaps: { disable: 'disable-upload' } }),
    });
    await build.write({ dir: outDir, sourcemap: true });

    const chunk = fs.readFileSync(path.join(outDir, 'entry.js'), 'utf8');
    const map = JSON.parse(fs.readFileSync(path.join(outDir, 'entry.js.map'), 'utf8'));
    const debugId = chunk.match(DEBUG_ID_MARKER)?.[1];

    expect(debugId).toBeDefined();
    expect(map.debug_id).toBe(debugId);
    expect(map.debugId).toBe(debugId);
    expect(chunk).toContain(`//# debugId=${debugId}`);
  });

  it('stamps a hidden source map that the chunk does not reference', async () => {
    const outDir = path.join(tmpDir, 'dist');
    const build = await rollup({
      input: entry,
      plugins: [sentryRollupPlugin({ telemetry: false, sourcemaps: { disable: 'disable-upload' } })],
    });
    await build.write({ dir: outDir, sourcemap: 'hidden' });

    const chunk = fs.readFileSync(path.join(outDir, 'entry.js'), 'utf8');
    const map = JSON.parse(fs.readFileSync(path.join(outDir, 'entry.js.map'), 'utf8'));
    const debugId = chunk.match(DEBUG_ID_MARKER)?.[1];

    expect(debugId).toBeDefined();
    expect(chunk).not.toContain('sourceMappingURL');
    expect(map.debug_id).toBe(debugId);
    expect(chunk).toContain(`//# debugId=${debugId}`);
  });

  it('does not register the generateBundle hook when uploading is enabled', () => {
    const [plugin] = sentryRollupPlugin({ telemetry: false });

    expect(plugin).not.toHaveProperty('generateBundle');
  });

  it('stamps the chunk and warns when the source map is inlined into the chunk', async () => {
    const outDir = path.join(tmpDir, 'dist');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const build = await rollup({
      input: entry,
      plugins: [sentryRollupPlugin({ telemetry: false, sourcemaps: { disable: 'disable-upload' } })],
    });
    await build.write({ dir: outDir, sourcemap: 'inline' });

    const chunk = fs.readFileSync(path.join(outDir, 'entry.js'), 'utf8');
    const debugId = chunk.match(DEBUG_ID_MARKER)?.[1];

    expect(debugId).toBeDefined();
    expect(chunk).toContain(`//# debugId=${debugId}`);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('1 bundle(s) inline their source map'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('entry.js'));
    warn.mockRestore();
  });
});
