import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { EntryPlugin, SourceMapDevToolPlugin, webpack } from 'webpack';
import type { Compiler, Configuration, Stats } from 'webpack';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sentryWebpackPlugin } from '../../src/webpack/index';
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

type Upload = { directory: string; files: Record<string, string> };

function build(config: Configuration | Configuration[]): Promise<Stats> {
  return new Promise((resolve, reject) => {
    webpack(config as Configuration, (err, stats) => {
      if (err) {
        return reject(err);
      }
      if (!stats || stats.hasErrors()) {
        return reject(new Error(stats?.toString() ?? 'no stats'));
      }
      resolve(stats as Stats);
    });
  });
}

function run(compiler: Compiler): Promise<Stats> {
  return new Promise((resolve, reject) => {
    compiler.run((err, stats) => {
      if (err || !stats || stats.hasErrors()) {
        return reject(err ?? new Error(stats?.toString() ?? 'no stats'));
      }
      resolve(stats);
    });
  });
}

function createChildCompilerPlugin(context: string): { apply(compiler: Compiler): void } {
  return {
    apply(compiler) {
      compiler.hooks.make.tapAsync('test-child-compiler', (compilation, callback) => {
        const childCompiler = compilation.createChildCompiler('test-child-compiler', { filename: 'worker.js' }, [
          new EntryPlugin(context, './worker.js', { name: 'worker' }),
        ]);
        childCompiler.runAsChild(error => callback(error ?? undefined));
      });
    },
  };
}

describe('sourcemaps.deleteSourcemapsAfterUpload (webpack)', () => {
  let tmpDir: string;
  let outDir: string;
  let uploads: Upload[];

  beforeEach(() => {
    vi.clearAllMocks();
    uploads = [];
    mockSourcemapUpload.mockImplementation(async ({ directory }: { directory: string }) => {
      const files: Record<string, string> = {};
      for (const file of fs.readdirSync(directory)) {
        files[file] = fs.readFileSync(path.join(directory, file), 'utf8');
      }
      uploads.push({ directory, files });
    });

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-webpack-delete-maps-'));
    outDir = path.join(tmpDir, 'dist');
    fs.writeFileSync(path.join(tmpDir, 'entry.js'), 'export const answer = 42;\nconsole.log(answer);\n');
    fs.writeFileSync(path.join(tmpDir, 'worker.js'), 'globalThis.workerLoaded = true;\n');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function config(pluginOptions: Options = {}, overrides: Configuration = {}): Configuration {
    return {
      mode: 'production',
      context: tmpDir,
      entry: './entry.js',
      output: { path: outDir, filename: 'bundle.js' },
      plugins: [sentryWebpackPlugin({ ...credentials, ...pluginOptions })],
      ...overrides,
    };
  }

  function expectUploadedPair(
    upload: Upload,
    bundle: string,
  ): { debugId: string; stagedBundle: string; map: Record<string, unknown> } {
    const debugId = bundle.match(DEBUG_ID_MARKER)?.[1];
    expect(debugId).toBeDefined();
    const jsName = Object.keys(upload.files).find(name => name.startsWith(`${debugId}-`) && name.endsWith('.js'));
    expect(jsName).toBeDefined();
    const stagedBundle = upload.files[jsName!]!;
    expect(stagedBundle).toContain(`//# debugId=${debugId}`);
    const map = JSON.parse(upload.files[`${jsName}.map`]!);
    expect(map).toMatchObject({ debug_id: debugId });
    expect(fs.existsSync(upload.directory)).toBe(false);
    return { debugId: debugId!, stagedBundle, map };
  }

  it('enables hidden source maps, uploads them and leaves none in the output when devtool is unset', async () => {
    const stats = await build(config());

    expect(stats.compilation.options.devtool).toBe('hidden-source-map');
    expect(fs.readdirSync(outDir)).toEqual(['bundle.js']);
    const bundle = fs.readFileSync(path.join(outDir, 'bundle.js'), 'utf8');
    expect(bundle).not.toContain('sourceMappingURL');

    expect(uploads).toHaveLength(1);
    expectUploadedPair(uploads[0]!, bundle);
  });

  it('switches visible source maps to hidden and removes them when the option is true', async () => {
    const stats = await build(
      config({ sourcemaps: { deleteSourcemapsAfterUpload: true } }, { devtool: 'cheap-module-source-map' }),
    );

    expect(stats.compilation.options.devtool).toBe('hidden-cheap-module-source-map');
    expect(fs.readdirSync(outDir)).toEqual(['bundle.js']);
    expect(fs.readFileSync(path.join(outDir, 'bundle.js'), 'utf8')).not.toContain('sourceMappingURL');
    expect(uploads).toHaveLength(1);
  });

  it('stages bundles whose debug ID webpack injects itself', async () => {
    const stats = await build(
      config({ sourcemaps: { deleteSourcemapsAfterUpload: true } }, { devtool: 'source-map-debugids' }),
    );

    expect(stats.compilation.options.devtool).toBe('hidden-source-map-debugids');
    expect(fs.readdirSync(outDir)).toEqual(['bundle.js']);
    const bundle = fs.readFileSync(path.join(outDir, 'bundle.js'), 'utf8');
    expect(bundle).toContain('//# debugId=');
    expect(uploads).toHaveLength(1);
    expectUploadedPair(uploads[0]!, bundle);
  });

  it('keeps hidden source maps the user enabled and uploads them from disk', async () => {
    await build(config({}, { devtool: 'hidden-source-map' }));

    expect(fs.readdirSync(outDir).sort()).toEqual(['bundle.js', 'bundle.js.map']);
    expect(uploads).toHaveLength(1);
    expectUploadedPair(uploads[0]!, fs.readFileSync(path.join(outDir, 'bundle.js'), 'utf8'));
  });

  it('keeps visible source maps when the option is unset', async () => {
    const stats = await build(config({}, { devtool: 'source-map' }));

    expect(stats.compilation.options.devtool).toBe('source-map');
    expect(fs.readdirSync(outDir).sort()).toEqual(['bundle.js', 'bundle.js.map']);
  });

  it('does not enable source maps when the option is false', async () => {
    await build(config({ sourcemaps: { deleteSourcemapsAfterUpload: false } }));

    expect(fs.readdirSync(outDir)).toEqual(['bundle.js']);
    expect(uploads).toHaveLength(0);
  });

  it('warns when source maps are turned off', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await build(config({ silent: false }, { devtool: false }));

    expect(fs.readdirSync(outDir)).toEqual(['bundle.js']);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Source map generation is turned off'));
  });

  it('warns when source maps are inlined and keeps them', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await build(
      config({ silent: false, sourcemaps: { deleteSourcemapsAfterUpload: true } }, { devtool: 'inline-source-map' }),
    );

    expect(fs.readFileSync(path.join(outDir, 'bundle.js'), 'utf8')).toContain('sourceMappingURL=data:');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Source maps are inlined'));
  });

  it('leaves a manual SourceMapDevToolPlugin alone', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const stats = await build({
      ...config({ silent: false }),
      devtool: false,
      plugins: [
        new SourceMapDevToolPlugin({ filename: '[file].map' }),
        sentryWebpackPlugin({ ...credentials, silent: false }),
      ],
    });

    expect(stats.compilation.options.devtool).toBe(false);
    expect(fs.readdirSync(outDir).sort()).toEqual(['bundle.js', 'bundle.js.map']);
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('Source map generation is turned off'));
  });

  it('does not touch development builds', async () => {
    const stats = await build(config({}, { mode: 'development' }));

    expect(stats.compilation.options.devtool).toBe('eval');
    expect(fs.readdirSync(outDir)).toEqual(['bundle.js']);
  });

  it('does not enable source maps when no upload can run', async () => {
    const mkdtempSpy = vi.spyOn(fs.promises, 'mkdtemp');
    const stats = await build(config({ authToken: undefined }));

    expect(stats.compilation.options.devtool).toBe(false);
    expect(fs.readdirSync(outDir)).toEqual(['bundle.js']);
    expect(uploads).toHaveLength(0);
    expect(mkdtempSpy).not.toHaveBeenCalled();
  });

  it('stages the final content of content-hashed bundles', async () => {
    await build(config({}, { output: { path: outDir, filename: '[name].[contenthash].js' } }));

    const bundleFileName = fs.readdirSync(outDir).find(file => file.endsWith('.js'))!;
    const bundle = fs.readFileSync(path.join(outDir, bundleFileName), 'utf8');
    expect(fs.readdirSync(outDir)).toEqual([bundleFileName]);

    const { debugId, stagedBundle, map } = expectUploadedPair(uploads[0]!, bundle);
    expect(stagedBundle.replace(`\n//# debugId=${debugId}`, '')).toBe(bundle);
    expect(map.file).toBe(bundleFileName);
  });

  it('serves every compiler of a MultiCompiler on its own', async () => {
    const otherOutDir = path.join(tmpDir, 'dist-other');
    const plugin = sentryWebpackPlugin(credentials);

    await build([
      { ...config(), plugins: [plugin] },
      { ...config(), output: { path: otherOutDir, filename: 'other.js' }, plugins: [plugin] },
    ]);

    expect(fs.readdirSync(outDir)).toEqual(['bundle.js']);
    expect(fs.readdirSync(otherOutDir)).toEqual(['other.js']);
    expect(uploads).toHaveLength(2);
  });

  it('stages the bundles of child compilers with the parent compilation', async () => {
    await build({ ...config(), plugins: [sentryWebpackPlugin(credentials), createChildCompilerPlugin(tmpDir)] });

    expect(fs.readdirSync(outDir).sort()).toEqual(['bundle.js', 'worker.js']);
    expect(uploads).toHaveLength(1);
    expect(Object.keys(uploads[0]!.files).filter(name => name.endsWith('.js'))).toHaveLength(2);
    expectUploadedPair(uploads[0]!, fs.readFileSync(path.join(outDir, 'bundle.js'), 'utf8'));
  });

  it('leaves no staging folder behind over several compilations', async () => {
    const stagingFolders = (): string[] =>
      fs.readdirSync(os.tmpdir()).filter(name => name.startsWith('sentry-bundler-plugin-upload-'));
    const before = stagingFolders();

    const compiler = webpack(config());
    await run(compiler);
    await run(compiler);
    await new Promise<void>((resolve, reject) => compiler.close(err => (err ? reject(err) : resolve())));

    expect(uploads).toHaveLength(2);
    expect(stagingFolders()).toEqual(before);
  });

  it('keeps a map it could not prepare instead of dropping it unuploaded', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const breakSourceMap = {
      apply(compiler: Compiler) {
        compiler.hooks.thisCompilation.tap('break-source-map', compilation => {
          compilation.hooks.processAssets.tap(
            { name: 'break-source-map', stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_TRANSFER },
            () => compilation.updateAsset('bundle.js.map', new compiler.webpack.sources.RawSource('not json')),
          );
        });
      },
    };

    await build({
      ...config({ silent: false }),
      plugins: [sentryWebpackPlugin({ ...credentials, silent: false }), breakSourceMap],
    });

    expect(fs.readdirSync(outDir).sort()).toEqual(['bundle.js', 'bundle.js.map']);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('stays in the build output'));
  });

  it('leaves "disable-upload" builds untouched', async () => {
    await build(config({ sourcemaps: { disable: 'disable-upload' } }, { devtool: 'source-map' }));

    expect(fs.readdirSync(outDir).sort()).toEqual(['bundle.js', 'bundle.js.map']);
    expect(uploads).toHaveLength(0);
  });
});
