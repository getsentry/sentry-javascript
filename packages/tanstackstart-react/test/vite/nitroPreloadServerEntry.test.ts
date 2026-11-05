// @vitest-environment node
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  makePreloadNitroServerEntryPlugin,
  parseServiceEntries,
  renderPreloadModule,
  setAwaitedServices,
} from '../../src/vite/nitroPreloadServerEntry';

const PRELOAD_MODULE_ID = '#sentry/tanstackstart-react/preload-server-entry';
const RESOLVED_PRELOAD_MODULE_ID = `\0${PRELOAD_MODULE_ID}`;
const SSR_ENTRY = '/app/node_modules/.nitro/vite/services/ssr/index.js';
const API_ENTRY = 'C:/app/node_modules/.nitro/vite/services/api/index.js';

type PreloadPlugin = ReturnType<typeof makePreloadNitroServerEntryPlugin>;
type TestNitro = Parameters<PreloadPlugin['nitro']['setup']>[0];
type LoadContext = {
  resolve: (id: string, importer?: string) => Promise<{ id: string; external: boolean } | null>;
  load: (resolved: { id: string }) => Promise<{ code: string | null }>;
};
type RenderChunkContext = { getModuleInfo: (id: string) => { importedIds: string[] } | null };

// The shape of the production module of `nitro/vite` that imports the services lazily.
function servicesModule(entries: Record<string, string>): string {
  return `
function lazyService(loader) {
  let promise, mod
  return { fetch(req) { return loader().then(mod => mod.fetch(req)) } }
}

export const viteServices = {
${Object.entries(entries)
  .map(([name, entry]) => `[${JSON.stringify(name)}]: lazyService(() => import(${JSON.stringify(entry)}))`)
  .join(',\n')}
};
  `;
}

function createNitro(options: Partial<TestNitro['options']> = {}): TestNitro {
  return { options: { dev: false, node: true, plugins: [], ...options } };
}

async function load(plugin: PreloadPlugin, modules: Record<string, string>): Promise<string | null> {
  const context: LoadContext = {
    resolve: async id => (id in modules || id.startsWith('/') || id.startsWith('C:') ? { id, external: false } : null),
    load: async ({ id }) => ({ code: modules[id] ?? null }),
  };
  const hook = plugin.load as (this: LoadContext, id: string) => Promise<string | null>;
  return hook.call(context, RESOLVED_PRELOAD_MODULE_ID);
}

function renderChunk(
  plugin: PreloadPlugin,
  code: string,
  graph: Record<string, string[]>,
  moduleIds = [RESOLVED_PRELOAD_MODULE_ID],
): { code: string } | null {
  const context: RenderChunkContext = {
    getModuleInfo: id => (graph[id] ? { importedIds: graph[id] } : null),
  };
  const hook = plugin.renderChunk as (
    this: RenderChunkContext,
    code: string,
    chunk: { moduleIds: string[] },
  ) => { code: string } | null;
  return hook.call(context, code, { moduleIds });
}

describe('makePreloadNitroServerEntryPlugin', () => {
  it('adds the preload plugin to the Nitro server build', () => {
    const plugin = makePreloadNitroServerEntryPlugin({});
    const nitro = createNitro({ plugins: ['./plugins/user'] });

    plugin.nitro.setup(nitro);

    expect(nitro.options.plugins).toEqual(['./plugins/user', PRELOAD_MODULE_ID]);
  });

  it.each([
    { label: 'in dev', options: { dev: true } },
    { label: 'for presets without Node.js, such as workers', options: { node: false } },
  ])('does not add the preload plugin $label', ({ options }) => {
    const plugin = makePreloadNitroServerEntryPlugin({});
    const nitro = createNitro(options);

    plugin.nitro.setup(nitro);

    expect(nitro.options.plugins).toEqual([]);
  });

  it.each(['#nitro/virtual/vite-services', '#nitro-vite-setup'])(
    'imports the service entries of the Nitro module %s, with the same specifiers',
    async servicesModuleId => {
      const plugin = makePreloadNitroServerEntryPlugin({});

      const code = await load(plugin, {
        [servicesModuleId]: servicesModule({ ssr: SSR_ENTRY, api: API_ENTRY }),
      });

      expect(code).toContain(`import(${JSON.stringify(SSR_ENTRY)})`);
      expect(code).toContain(`import(${JSON.stringify(API_ENTRY)})`);
    },
  );

  it('imports nothing without the services module of Nitro', async () => {
    const plugin = makePreloadNitroServerEntryPlugin({});

    const code = await load(plugin, {});

    expect(code).not.toContain('import(');
    expect(code).toContain('export default function');
  });

  it('awaits only the service entries that do not import the preload module', async () => {
    const plugin = makePreloadNitroServerEntryPlugin({});
    const code = await load(plugin, {
      '#nitro/virtual/vite-services': servicesModule({ ssr: SSR_ENTRY, api: API_ENTRY }),
    });

    const result = renderChunk(plugin, code ?? '', {
      [SSR_ENTRY]: ['react'],
      react: [],
      // Through a dependency that the service build did not bundle.
      [API_ENTRY]: ['some-lib'],
      'some-lib': ['/app/node_modules/nitro/dist/runtime/app.mjs'],
      '/app/node_modules/nitro/dist/runtime/app.mjs': ['#nitro/virtual/plugins'],
      '#nitro/virtual/plugins': [RESOLVED_PRELOAD_MODULE_ID],
    });

    expect(result?.code).toContain('const awaitedServices = [true,false];');
  });

  it('does not await a service entry with unknown imports', async () => {
    const plugin = makePreloadNitroServerEntryPlugin({});
    const code = await load(plugin, { '#nitro/virtual/vite-services': servicesModule({ ssr: SSR_ENTRY }) });

    const result = renderChunk(plugin, code ?? '', { [SSR_ENTRY]: ['unknown'] });

    expect(result?.code).toContain('const awaitedServices = [false];');
  });

  it('leaves chunks without the preload module alone', () => {
    const plugin = makePreloadNitroServerEntryPlugin({});

    expect(renderChunk(plugin, 'export {}', {}, ['/app/other.mjs'])).toBeNull();
  });
});

describe('parseServiceEntries', () => {
  it('reads the service entries with escaped characters in their paths', () => {
    const entry = 'C:\\app\\services\\"ssr"\\index.js';

    expect(parseServiceEntries(servicesModule({ ssr: entry }))).toEqual([entry]);
  });

  it('reads nothing from a module of another shape', () => {
    expect(parseServiceEntries('export const viteServices = {};')).toEqual([]);
  });
});

describe('renderPreloadModule', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-tanstackstart-preload-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function writeEntry(code: string): string {
    const entry = path.join(tempDir, 'entry.mjs');
    fs.writeFileSync(entry, code);
    return entry;
  }

  async function importModule(code: string): Promise<{ default: unknown }> {
    const file = path.join(tempDir, 'preload.mjs');
    fs.writeFileSync(file, code);
    return import(pathToFileURL(file).href);
  }

  // Marks the run with the directory of the test, as entries that are not awaited finish after the test.
  function writeSlowEntry(): string {
    return writeEntry(
      `await new Promise(resolve => setTimeout(resolve, 20)); globalThis.__preloadTestEntryRan = ${JSON.stringify(tempDir)};`,
    );
  }

  it('finishes loading only after the awaited service entries ran', async () => {
    const entry = writeSlowEntry();

    const preload = await importModule(setAwaitedServices(renderPreloadModule([entry]), [true]));

    expect((globalThis as { __preloadTestEntryRan?: string }).__preloadTestEntryRan).toBe(tempDir);
    expect(preload.default).toEqual(expect.any(Function));
  });

  it.each([
    {
      label: 'service entries that are not awaited',
      code: (entry: string) => setAwaitedServices(renderPreloadModule([entry]), [false]),
    },
    {
      label: 'a build that did not decide which services to await',
      code: (entry: string) => renderPreloadModule([entry]),
    },
  ])('does not wait for $label', async ({ code }) => {
    const entry = writeSlowEntry();

    await importModule(code(entry));

    expect((globalThis as { __preloadTestEntryRan?: string }).__preloadTestEntryRan).not.toBe(tempDir);
  });

  it('does not fail when a service entry throws', async () => {
    const entry = writeEntry('throw new Error("entry failed");');

    const preload = await importModule(setAwaitedServices(renderPreloadModule([entry]), [true]));

    expect(preload.default).toEqual(expect.any(Function));
  });

  it('logs the error of a service entry with debug enabled', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const entry = writeEntry('throw new Error("entry failed");');

    await importModule(setAwaitedServices(renderPreloadModule([entry], true), [true]));

    expect(warn).toHaveBeenCalledWith(
      '[Sentry] Loading a Nitro service entry at server startup failed:',
      expect.objectContaining({ message: 'entry failed' }),
    );
  });

  it('stops waiting and warns when a service entry does not finish loading', { timeout: 10_000 }, async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const entry = writeEntry('await new Promise(() => {});');

    const preload = await importModule(setAwaitedServices(renderPreloadModule([entry]), [true]));

    expect(preload.default).toEqual(expect.any(Function));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('The first request may not be traced.'));
  });
});
