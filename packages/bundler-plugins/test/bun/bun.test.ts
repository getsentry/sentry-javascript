import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type * as DebugIdUpload from '../../src/core/debug-id-upload';

const { uploadSpy } = vi.hoisted(() => ({ uploadSpy: vi.fn() }));

vi.mock('../../src/core/debug-id-upload', async importOriginal => ({
  ...(await importOriginal<typeof DebugIdUpload>()),
  createDebugIdUploadFunction: () => uploadSpy,
}));

import { sentryBunPlugin } from '../../src/bun';

const DEBUG_ID_MARKER = /sentry-dbid-([0-9a-f-]{36})/;
const PLACEHOLDER = 'sentry-bun-debug-id-placeholder-0000';
const BUN_DEBUG_ID = '0217B9855BFB77DF64756E2164756E21';
const UUID = '0217b985-5bfb-77df-6475-6e2164756e21';

type Output = { path: string; kind: string };
type OnEnd = (result: { success: boolean; outputs: Output[]; logs: unknown[] }) => Promise<void>;
type Config = { banner?: string; sourcemap?: string | boolean; define?: Record<string, string>; outdir?: string };

interface BunPlugin {
  name: string;
  setup: (build: { config?: Config; onEnd: (cb: OnEnd) => void }) => void;
}

function setupPlugin(plugin: BunPlugin, config: Config | undefined) {
  let onEnd: OnEnd | undefined;
  plugin.setup({
    config,
    onEnd: cb => {
      onEnd = cb;
    },
  });
  return {
    onEnd,
    end: (outputs: Output[]) => onEnd!({ success: true, outputs, logs: [] }),
  };
}

describe('sentryBunPlugin', () => {
  let outDir: string;

  beforeEach(() => {
    uploadSpy.mockReset();
    outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-bun-plugin-'));
  });

  afterEach(() => {
    fs.rmSync(outDir, { recursive: true, force: true });
  });

  // Emulates what Bun writes for a bundle whose banner contains the snippet
  function writeBundle(name: string, banner: string, debugId: string | null = BUN_DEBUG_ID): string {
    const file = path.join(outDir, name);
    const debugIdComment = debugId ? `\n//# debugId=${debugId}\n` : '\n';
    fs.writeFileSync(file, `// @bun\n${banner}\nconsole.log(1);\n${debugIdComment}`);
    fs.writeFileSync(`${file}.map`, JSON.stringify({ version: 3, mappings: ';;AAAA', debugId }));
    return file;
  }

  it('returns a Bun plugin', () => {
    expect(sentryBunPlugin({ telemetry: false })).toEqual({ name: 'sentry-bun-plugin', setup: expect.any(Function) });
  });

  it('does nothing when Bun runs it as a runtime plugin, which has no build config', () => {
    const { onEnd } = setupPlugin(sentryBunPlugin({ telemetry: false }) as BunPlugin, undefined);
    expect(onEnd).toBeUndefined();
  });

  it('adds the debug ID snippet to the banner when Bun emits source maps', () => {
    const config: Config = { banner: '// existing', sourcemap: 'external', outdir: outDir };
    setupPlugin(sentryBunPlugin({ telemetry: false }) as BunPlugin, config);

    expect(config.banner).toMatch(/^\/\/ existing\n/);
    expect(config.banner).toContain(PLACEHOLDER);
  });

  it.each([undefined, 'none', false])('does not add the debug ID snippet when `sourcemap` is %s', sourcemap => {
    const config: Config = { sourcemap, outdir: outDir };
    setupPlugin(sentryBunPlugin({ telemetry: false }) as BunPlugin, config);

    expect(config.banner ?? '').not.toContain('sentry-dbid-');
  });

  it('does not add the debug ID snippet when Bun keeps the output in memory', () => {
    const config: Config = { sourcemap: 'external' };
    setupPlugin(sentryBunPlugin({ telemetry: false }) as BunPlugin, config);

    expect(config.banner ?? '').not.toContain('sentry-dbid-');
  });

  it('injects the release into the banner', () => {
    const config: Config = { outdir: outDir };
    setupPlugin(sentryBunPlugin({ telemetry: false, release: { name: '1.2.3' } }) as BunPlugin, config);

    expect(config.banner).toContain('SENTRY_RELEASE={id:"1.2.3"}');
  });

  it('defines the bundle size optimization flags', () => {
    const config: Config = { define: { FOO: '"bar"' }, outdir: outDir };
    setupPlugin(
      sentryBunPlugin({ telemetry: false, bundleSizeOptimizations: { excludeDebugStatements: true } }) as BunPlugin,
      config,
    );

    expect(config.define).toEqual({ FOO: '"bar"', __SENTRY_DEBUG__: 'false' });
  });

  it('stamps each emitted bundle with the debug ID Bun wrote into it', async () => {
    const config: Config = { sourcemap: 'external', outdir: outDir };
    const { end } = setupPlugin(sentryBunPlugin({ telemetry: false }) as BunPlugin, config);

    const entry = writeBundle('index.js', config.banner!);
    const chunk = writeBundle('chunk-abc.js', config.banner!, 'DC1E64A3985F409564756E2164756E21');
    const mapBefore = fs.readFileSync(`${entry}.map`, 'utf8');

    await end([
      { path: entry, kind: 'entry-point' },
      { path: chunk, kind: 'chunk' },
      { path: `${entry}.map`, kind: 'sourcemap' },
      { path: `${chunk}.map`, kind: 'sourcemap' },
    ]);

    const entrySource = fs.readFileSync(entry, 'utf8');
    expect(entrySource.match(DEBUG_ID_MARKER)?.[1]).toBe(UUID);
    expect(entrySource).toContain(`//# debugId=${BUN_DEBUG_ID}`);
    expect(entrySource.length).toBe(
      config.banner!.length + `// @bun\n\nconsole.log(1);\n\n//# debugId=${BUN_DEBUG_ID}\n`.length,
    );
    expect(fs.readFileSync(chunk, 'utf8').match(DEBUG_ID_MARKER)?.[1]).toBe('dc1e64a3-985f-4095-6475-6e2164756e21');
    expect(fs.readFileSync(`${entry}.map`, 'utf8')).toBe(mapBefore);
  });

  it('stamps a bundle that has a source map URL after the debug ID', async () => {
    const config: Config = { sourcemap: 'linked', outdir: outDir };
    const { end } = setupPlugin(sentryBunPlugin({ telemetry: false }) as BunPlugin, config);

    const entry = path.join(outDir, 'index.js');
    fs.writeFileSync(
      entry,
      `// @bun\n${config.banner}\nconsole.log(1);\n\n//# debugId=${BUN_DEBUG_ID}\n//# sourceMappingURL=index.js.map\n`,
    );

    await end([{ path: entry, kind: 'entry-point' }]);

    expect(fs.readFileSync(entry, 'utf8').match(DEBUG_ID_MARKER)?.[1]).toBe(UUID);
  });

  it('leaves a bundle without a Bun debug ID unchanged', async () => {
    const config: Config = { sourcemap: 'external', outdir: outDir };
    const { end } = setupPlugin(sentryBunPlugin({ telemetry: false }) as BunPlugin, config);

    const entry = writeBundle('index.js', config.banner!, null);
    const before = fs.readFileSync(entry, 'utf8');

    await end([{ path: entry, kind: 'entry-point' }]);

    expect(fs.readFileSync(entry, 'utf8')).toBe(before);
  });

  it('uploads the emitted bundles', async () => {
    const config: Config = { sourcemap: 'external', outdir: outDir };
    const { end } = setupPlugin(sentryBunPlugin({ telemetry: false }) as BunPlugin, config);

    const entry = writeBundle('index.js', config.banner!);
    const chunk = writeBundle('chunk-abc.js', config.banner!);

    await end([
      { path: entry, kind: 'entry-point' },
      { path: chunk, kind: 'chunk' },
      { path: `${entry}.map`, kind: 'sourcemap' },
    ]);

    expect(uploadSpy).toHaveBeenCalledWith([entry, chunk]);
  });

  it('stamps but does not upload with `sourcemaps.disable: "disable-upload"`', async () => {
    const config: Config = { sourcemap: 'external', outdir: outDir };
    const { end } = setupPlugin(
      sentryBunPlugin({ telemetry: false, sourcemaps: { disable: 'disable-upload' } }) as BunPlugin,
      config,
    );

    const entry = writeBundle('index.js', config.banner!);

    await end([{ path: entry, kind: 'entry-point' }]);

    expect(fs.readFileSync(entry, 'utf8').match(DEBUG_ID_MARKER)?.[1]).toBe(UUID);
    expect(uploadSpy).not.toHaveBeenCalled();
  });

  it('does not inject or upload with `sourcemaps.disable: true`', async () => {
    const config: Config = { sourcemap: 'external', outdir: outDir };
    const { end } = setupPlugin(
      sentryBunPlugin({ telemetry: false, sourcemaps: { disable: true } }) as BunPlugin,
      config,
    );

    expect(config.banner ?? '').not.toContain('sentry-dbid-');

    await end([]);

    expect(uploadSpy).not.toHaveBeenCalled();
  });
});
