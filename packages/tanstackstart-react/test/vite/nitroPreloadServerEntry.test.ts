// @vitest-environment node
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';
import type { Rollup } from 'vite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makePreloadNitroServerEntryPlugin, renderPreloadPlugin } from '../../src/vite/nitroPreloadServerEntry';

const PRELOAD_PLUGIN_ID = '#sentry/tanstackstart-react/preload-server-entry';

type TestNitro = Parameters<ReturnType<typeof makePreloadNitroServerEntryPlugin>['nitro']['setup']>[0];

function createNitro(options: Partial<TestNitro['options']> = {}): TestNitro {
  return { options: { dev: false, node: true, plugins: [], virtual: {}, ...options } };
}

function createChunk(fileName: string, chunk: Partial<Rollup.OutputChunk> = {}): Rollup.OutputChunk {
  return { type: 'chunk', fileName, isEntry: false, imports: [], dynamicImports: [], ...chunk } as Rollup.OutputChunk;
}

function writeServiceBundle(
  plugin: ReturnType<typeof makePreloadNitroServerEntryPlugin>,
  environmentName: string,
  dir: string,
  chunks: Rollup.OutputChunk[],
  input?: Rollup.InputOption,
): void {
  const bundle = Object.fromEntries(chunks.map(chunk => [chunk.fileName, chunk]));
  const writeBundle = plugin.writeBundle as (
    this: { environment: { name: string; config: { build: { rolldownOptions: { input?: Rollup.InputOption } } } } },
    options: { dir?: string },
    bundle: Rollup.OutputBundle,
  ) => void;
  writeBundle.call(
    { environment: { name: environmentName, config: { build: { rolldownOptions: { input } } } } },
    { dir },
    bundle,
  );
}

async function renderVirtualModule(nitro: TestNitro): Promise<string> {
  const template = nitro.options.virtual[PRELOAD_PLUGIN_ID];
  return typeof template === 'function' ? template() : (template as string);
}

describe('makePreloadNitroServerEntryPlugin', () => {
  it('adds the preload plugin to the Nitro server build', () => {
    const plugin = makePreloadNitroServerEntryPlugin();
    const nitro = createNitro({ plugins: ['./plugins/user'] });

    plugin.nitro.setup(nitro);

    expect(nitro.options.plugins).toEqual(['./plugins/user', PRELOAD_PLUGIN_ID]);
    expect(nitro.options.virtual[PRELOAD_PLUGIN_ID]).toEqual(expect.any(Function));
  });

  it.each([
    { label: 'in dev', options: { dev: true } },
    { label: 'for presets without Node.js, such as workers', options: { node: false } },
  ])('does not add the preload plugin $label', ({ options }) => {
    const plugin = makePreloadNitroServerEntryPlugin();
    const nitro = createNitro(options);

    plugin.nitro.setup(nitro);

    expect(nitro.options.plugins).toEqual([]);
    expect(nitro.options.virtual).toEqual({});
  });

  it('awaits the entry of each service', async () => {
    const plugin = makePreloadNitroServerEntryPlugin();
    const nitro = createNitro();
    plugin.nitro.setup(nitro);

    writeServiceBundle(plugin, 'ssr', '/app/node_modules/.nitro/vite/services/ssr', [
      createChunk('index.js', { isEntry: true, imports: ['react', 'assets/routes.js'] }),
      createChunk('assets/routes.js'),
    ]);

    const code = await renderVirtualModule(nitro);

    expect(code).toContain('await Promise.race(');
    expect(code).toContain('import("/app/node_modules/.nitro/vite/services/ssr/index.js")');
    expect(code).not.toContain('assets/routes.js');
  });

  it('preloads only the entry chunk of the build input, like Nitro', async () => {
    const plugin = makePreloadNitroServerEntryPlugin();
    const nitro = createNitro();
    plugin.nitro.setup(nitro);

    writeServiceBundle(
      plugin,
      'ssr',
      '/app/node_modules/.nitro/vite/services/ssr',
      [
        createChunk('other.js', { isEntry: true, facadeModuleId: '/app/src/other.ts' }),
        createChunk('index.js', { isEntry: true, facadeModuleId: '/app/src/server.ts' }),
      ],
      '/app/src/server.ts',
    );

    const code = await renderVirtualModule(nitro);

    expect(code).toContain('import("/app/node_modules/.nitro/vite/services/ssr/index.js")');
    expect(code).not.toContain('other.js');
  });

  it.each(['nitro', 'nitro/app', '#nitro/virtual/app', '/app/node_modules/nitro/dist/runtime/app.mjs'])(
    'does not await a service that imports the Nitro runtime (%s)',
    async nitroImport => {
      const plugin = makePreloadNitroServerEntryPlugin();
      const nitro = createNitro();
      plugin.nitro.setup(nitro);

      writeServiceBundle(plugin, 'ssr', '/app/node_modules/.nitro/vite/services/ssr', [
        createChunk('index.js', { isEntry: true, imports: ['assets/routes.js'] }),
        createChunk('assets/routes.js', { imports: [nitroImport] }),
      ]);

      const code = await renderVirtualModule(nitro);

      expect(code).not.toContain('await');
      expect(code).toContain('import("/app/node_modules/.nitro/vite/services/ssr/index.js").catch(() => {});');
    },
  );

  it('renders a plugin without imports if no service was built', async () => {
    const plugin = makePreloadNitroServerEntryPlugin();
    const nitro = createNitro();
    plugin.nitro.setup(nitro);

    const code = await renderVirtualModule(nitro);

    expect(code).not.toContain('import(');
    expect(code).toContain('export default function');
  });
});

describe('renderPreloadPlugin', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-tanstackstart-preload-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  async function importPlugin(code: string): Promise<{ default: unknown }> {
    const file = path.join(tempDir, 'plugin.mjs');
    fs.writeFileSync(file, code);
    return import(pathToFileURL(file).href);
  }

  it('finishes loading only after the service entries ran', async () => {
    const entry = path.join(tempDir, 'entry.mjs');
    fs.writeFileSync(
      entry,
      'await new Promise(resolve => setTimeout(resolve, 20)); globalThis.__preloadTestEntryRan = true;',
    );

    const plugin = await importPlugin(renderPreloadPlugin([{ file: entry, importsNitroRuntime: false }]));

    expect((globalThis as { __preloadTestEntryRan?: boolean }).__preloadTestEntryRan).toBe(true);
    expect(plugin.default).toEqual(expect.any(Function));
    delete (globalThis as { __preloadTestEntryRan?: boolean }).__preloadTestEntryRan;
  });

  it('does not fail when a service entry throws', async () => {
    const entry = path.join(tempDir, 'entry.mjs');
    fs.writeFileSync(entry, 'throw new Error("entry failed");');

    const plugin = await importPlugin(renderPreloadPlugin([{ file: entry, importsNitroRuntime: false }]));

    expect(plugin.default).toEqual(expect.any(Function));
  });

  it('stops waiting and warns when a service entry does not finish loading', { timeout: 10_000 }, async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const entry = path.join(tempDir, 'entry.mjs');
    fs.writeFileSync(entry, 'await new Promise(() => {});');

    const plugin = await importPlugin(renderPreloadPlugin([{ file: entry, importsNitroRuntime: false }]));

    expect(plugin.default).toEqual(expect.any(Function));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('The first request may not be traced.'));
    warn.mockRestore();
  });
});
