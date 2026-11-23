import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { sentryBunPlugin } from '../src/plugin';

const DEBUG_ID_MARKER = /sentry-dbid-([0-9a-f-]{36})/;
const BUN_DEBUG_ID = /\/\/# debugId=([0-9A-F]{32})/;

function readSourceMap(bundlePath: string, source: string): { debugId?: unknown } {
  const inlineMap = source.match(/^\/\/# sourceMappingURL=data:application\/json;base64,(.*)$/m)?.[1];
  return JSON.parse(
    inlineMap ? Buffer.from(inlineMap, 'base64').toString() : fs.readFileSync(`${bundlePath}.map`, 'utf8'),
  );
}

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

  test.each(['external', 'linked', 'inline'] as const)(
    'registers the debug ID that Bun wrote into each bundle and its source map (sourcemap: %s)',
    async sourcemap => {
      const outdir = path.join(tmpDir, 'dist');
      const result = await Bun.build({
        entrypoints: [path.join(tmpDir, 'src', 'index.ts')],
        outdir,
        target: 'bun',
        sourcemap,
        splitting: true,
        plugins: [sentryBunPlugin({ telemetry: false, sourcemaps: { disable: 'disable-upload' } })],
      });

      expect(result.success).toBe(true);

      const bundles = result.outputs.filter(o => o.kind === 'entry-point' || o.kind === 'chunk');
      expect(bundles.some(bundle => bundle.kind === 'chunk')).toBe(true);

      const debugIds = bundles.map(bundle => {
        const source = fs.readFileSync(bundle.path, 'utf8');
        const map = readSourceMap(bundle.path, source);
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
    },
  );

  async function buildWithSourceMaps(
    sourcemap: 'linked' | 'external' | undefined,
    deleteSourceMaps: boolean | undefined,
  ): Promise<{ maps: string[]; bundleSources: string[] }> {
    const outdir = path.join(tmpDir, 'dist');
    const result = await Bun.build({
      entrypoints: [path.join(tmpDir, 'src', 'index.ts')],
      outdir,
      target: 'bun',
      sourcemap,
      splitting: true,
      plugins: [sentryBunPlugin({ telemetry: false, sourcemaps: { delete: deleteSourceMaps } })],
    });

    expect(result.success).toBe(true);

    const files = fs.readdirSync(outdir);
    return {
      maps: files.filter(file => file.endsWith('.map')),
      bundleSources: files
        .filter(file => file.endsWith('.js'))
        .map(file => fs.readFileSync(path.join(outdir, file), 'utf8')),
    };
  }

  test.each(['linked', 'external'] as const)(
    'deletes the source maps and their URL comments with `sourcemaps.delete: true` (sourcemap: %s)',
    async sourcemap => {
      const { maps, bundleSources } = await buildWithSourceMaps(sourcemap, true);

      expect(bundleSources.length).toBeGreaterThan(1);
      expect(maps).toEqual([]);
      for (const source of bundleSources) {
        expect(source).not.toContain('sourceMappingURL');
      }
    },
  );

  test.each([false, undefined])('keeps linked source maps with `sourcemaps.delete: %s`', async deleteSourceMaps => {
    const { maps, bundleSources } = await buildWithSourceMaps('linked', deleteSourceMaps);

    expect(bundleSources.length).toBeGreaterThan(1);
    expect(maps.length).toBe(bundleSources.length);
    for (const source of bundleSources) {
      expect(source).toMatch(/^\/\/# sourceMappingURL=.+\.js\.map$/m);
    }
  });

  test('turns on hidden source maps and keeps them with `sourcemaps.delete: false`', async () => {
    const { maps, bundleSources } = await buildWithSourceMaps(undefined, false);

    expect(maps.length).toBe(bundleSources.length);
    for (const source of bundleSources) {
      expect(source).not.toContain('sourceMappingURL');
      expect(source).toMatch(DEBUG_ID_MARKER);
    }
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
