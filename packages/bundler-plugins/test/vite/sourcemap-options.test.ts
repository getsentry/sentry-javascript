import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { build } from 'vite';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sentryVitePlugin } from '../../src/vite';
import type { Options } from '../../src/core';

const { mockSourcemapUpload } = vi.hoisted(() => ({ mockSourcemapUpload: vi.fn() }));

vi.mock('sentry', () => ({
  createSentrySDK: () => ({
    release: { create: vi.fn(), finalize: vi.fn(), 'set-commits': vi.fn(), deploy: vi.fn() },
    sourcemap: { upload: mockSourcemapUpload, inject: vi.fn() },
    run: vi.fn(),
  }),
}));

const DEBUG_ID_MARKER = /sentry-dbid-([0-9a-f-]{36})/;

const credentials: Options = {
  authToken: 't',
  org: 'o',
  project: 'p',
  release: { name: 'test-release', create: false, finalize: false },
  telemetry: false,
  silent: true,
};

function listFiles(dir: string): string[] {
  return fs
    .readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter(file => fs.statSync(path.join(dir, file)).isFile());
}

describe('sourcemaps.upload, sourcemaps.injectDebugIds and sourcemaps.delete (vite)', () => {
  let root: string;
  let outDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('SENTRY_AUTH_TOKEN', '');
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-vite-sourcemap-options-'));
    outDir = path.join(root, 'dist');
    // A dynamic import makes Vite's import analysis regenerate the source map in `generateBundle`.
    fs.writeFileSync(path.join(root, 'main.js'), "import('./lazy.js').then(m => console.log(m.answer));\n");
    fs.writeFileSync(path.join(root, 'lazy.js'), 'export const answer = 42;\n');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(root, { recursive: true, force: true });
  });

  async function run(options: Options, sourcemap?: boolean | 'hidden'): Promise<{ chunks: string[]; maps: string[] }> {
    await build({
      configFile: false,
      logLevel: 'silent',
      root,
      plugins: sentryVitePlugin(options),
      build: { outDir, minify: false, sourcemap, rollupOptions: { input: path.join(root, 'main.js') } },
    });
    const files = listFiles(outDir);
    return { chunks: files.filter(file => file.endsWith('.js')), maps: files.filter(file => file.endsWith('.map')) };
  }

  function expectStampedMaps(chunks: string[]): void {
    for (const chunk of chunks) {
      const code = fs.readFileSync(path.join(outDir, chunk), 'utf8');
      const debugId = code.match(DEBUG_ID_MARKER)?.[1];
      expect(debugId).toBeDefined();
      expect(code).toContain(`//# debugId=${debugId}`);
      expect(JSON.parse(fs.readFileSync(path.join(outDir, `${chunk}.map`), 'utf8'))).toMatchObject({
        debug_id: debugId,
      });
    }
  }

  it('turns no source maps on with `upload: false`', async () => {
    const { chunks, maps } = await run({ ...credentials, sourcemaps: { upload: false } });

    expect(chunks).toHaveLength(2);
    expect(maps).toEqual([]);
    expect(mockSourcemapUpload).not.toHaveBeenCalled();
  });

  it('turns hidden source maps on and keeps them stamped with `upload: false` and `delete: false`', async () => {
    const { chunks, maps } = await run({ ...credentials, sourcemaps: { upload: false, delete: false } });

    expect(chunks).toHaveLength(2);
    expect(maps).toHaveLength(2);
    expectStampedMaps(chunks);
    expect(mockSourcemapUpload).not.toHaveBeenCalled();
  });

  it('injects no debug IDs and uploads nothing with `injectDebugIds: false`', async () => {
    const { chunks, maps } = await run({ ...credentials, sourcemaps: { injectDebugIds: false } }, true);

    expect(maps).toHaveLength(2);
    for (const chunk of chunks) {
      expect(fs.readFileSync(path.join(outDir, chunk), 'utf8')).not.toMatch(DEBUG_ID_MARKER);
    }
    expect(mockSourcemapUpload).not.toHaveBeenCalled();
  });

  it.each([true, 'hidden'] as const)(
    'uploads and removes source maps the user enabled with `delete: true` (%s)',
    async sourcemap => {
      const { chunks, maps } = await run({ ...credentials, sourcemaps: { delete: true } }, sourcemap);

      expect(maps).toEqual([]);
      for (const chunk of chunks) {
        expect(fs.readFileSync(path.join(outDir, chunk), 'utf8')).not.toContain('sourceMappingURL');
      }
      expect(mockSourcemapUpload).toHaveBeenCalledTimes(1);
    },
  );

  it('switches an output with its own visible setting to hidden maps and removes them with `delete: true`', async () => {
    await build({
      configFile: false,
      logLevel: 'silent',
      root,
      plugins: sentryVitePlugin({ ...credentials, sourcemaps: { delete: true } }),
      build: {
        outDir,
        minify: false,
        rollupOptions: { input: path.join(root, 'main.js'), output: { sourcemap: true } },
      },
    });
    const files = listFiles(outDir);
    const chunks = files.filter(file => file.endsWith('.js'));

    expect(chunks).toHaveLength(2);
    expect(files.filter(file => file.endsWith('.map'))).toEqual([]);
    for (const chunk of chunks) {
      expect(fs.readFileSync(path.join(outDir, chunk), 'utf8')).not.toContain('sourceMappingURL');
    }
    expect(mockSourcemapUpload).toHaveBeenCalledTimes(1);
  });

  it('removes source maps the user enabled with `delete: true` when no upload can run', async () => {
    const { maps } = await run({ ...credentials, authToken: undefined, sourcemaps: { delete: true } }, true);

    expect(maps).toEqual([]);
    expect(mockSourcemapUpload).not.toHaveBeenCalled();
  });

  it('turns hidden source maps on, uploads them and keeps them with `delete: false`', async () => {
    const { maps } = await run({ ...credentials, sourcemaps: { delete: false } });

    expect(maps).toHaveLength(2);
    expect(mockSourcemapUpload).toHaveBeenCalledTimes(1);
  });
});
