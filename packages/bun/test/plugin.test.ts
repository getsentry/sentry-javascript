import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { sentryBunPlugin } from '../src/plugin';

const DEBUG_ID_MARKER = /sentry-dbid-([0-9a-f-]{36})/;
const BUN_DEBUG_ID = /\/\/# debugId=([0-9A-F]{32})/;

function toUuid(bunDebugId: string): string {
  const hex = bunDebugId.toLowerCase();
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

describe('sentryBunPlugin', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-bun-plugin-'));
    fs.mkdirSync(path.join(tmpDir, 'src'));
    fs.writeFileSync(
      path.join(tmpDir, 'src', 'index.ts'),
      'const { value } = await import("./lazy");\nconsole.log(JSON.stringify({ value, ids: globalThis._sentryDebugIds }));\n',
    );
    fs.writeFileSync(path.join(tmpDir, 'src', 'lazy.ts'), 'export const value = 42;\n');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('registers the debug ID that Bun wrote into each bundle and its source map', async () => {
    const outdir = path.join(tmpDir, 'dist');
    const result = await Bun.build({
      entrypoints: [path.join(tmpDir, 'src', 'index.ts')],
      outdir,
      target: 'bun',
      sourcemap: 'external',
      splitting: true,
      plugins: [sentryBunPlugin({ telemetry: false, sourcemaps: { disable: 'disable-upload' } })],
    });

    expect(result.success).toBe(true);

    const bundles = result.outputs.filter(o => o.kind === 'entry-point' || o.kind === 'chunk');
    expect(bundles.length).toBe(2);

    const debugIds = bundles.map(bundle => {
      const source = fs.readFileSync(bundle.path, 'utf8');
      const map = JSON.parse(fs.readFileSync(`${bundle.path}.map`, 'utf8'));
      const bunDebugId = source.match(BUN_DEBUG_ID)?.[1];

      expect(bunDebugId).toBeDefined();
      expect(map.debugId).toBe(bunDebugId);
      expect(source.match(DEBUG_ID_MARKER)?.[1]).toBe(toUuid(bunDebugId!));
      return toUuid(bunDebugId!);
    });

    const run = Bun.spawnSync([process.execPath, path.join(outdir, 'index.js')]);
    const { value, ids } = JSON.parse(run.stdout.toString());

    expect(value).toBe(42);
    expect(Object.values(ids).sort()).toEqual(debugIds.sort());
  });

  test('builds when Bun keeps the output in memory', async () => {
    const result = await Bun.build({
      entrypoints: [path.join(tmpDir, 'src', 'index.ts')],
      target: 'bun',
      sourcemap: 'external',
      plugins: [sentryBunPlugin({ telemetry: false, sourcemaps: { disable: 'disable-upload' } })],
    });

    expect(result.success).toBe(true);
  });
});
