// @vitest-environment node
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';
import type { Rollup } from 'vite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  makePreloadNitroServerEntryPlugin,
  readViteServices,
  renderPreloadPlugin,
} from '../../src/vite/nitroPreloadServerEntry';

const PRELOAD_PLUGIN_ID = '#sentry/tanstackstart-react/preload-server-entry';
const VITE_SERVICES_ID = '#nitro/virtual/vite-services';
const SSR_ENTRY = '/app/node_modules/.nitro/vite/services/ssr/index.js';

type PreloadPlugin = ReturnType<typeof makePreloadNitroServerEntryPlugin>;
type TestNitro = Parameters<PreloadPlugin['nitro']['setup']>[0];

// The shape of the production template of `nitro/vite` (`viteServicesTemplate`).
function viteServicesTemplate(services: Record<string, string>): string {
  return `
function lazyService(loader) {
  let promise, mod
  return { fetch(req) { return loader().then(mod => mod.fetch(req)) } }
}

export const viteServices = {
${Object.entries(services)
  .map(([name, entry]) => `[${JSON.stringify(name)}]: lazyService(() => import(${JSON.stringify(entry)}))`)
  .join(',\n')}
};
  `;
}

function createNitro(options: Partial<TestNitro['options']> = {}): TestNitro {
  return { options: { dev: false, node: true, plugins: [], virtual: {}, ...options } };
}

function writeServiceBundle(plugin: PreloadPlugin, environmentName: string, imports: string[] = []): void {
  const chunk = { type: 'chunk', fileName: 'index.js', isEntry: true, imports, dynamicImports: [] };
  const writeBundle = plugin.writeBundle as (
    this: { environment: { name: string } },
    options: object,
    bundle: Rollup.OutputBundle,
  ) => void;
  writeBundle.call({ environment: { name: environmentName } }, {}, {
    'index.js': chunk,
  } as unknown as Rollup.OutputBundle);
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

  it('awaits the entries that Nitro imports lazily, with the same specifiers', async () => {
    const plugin = makePreloadNitroServerEntryPlugin();
    const windowsEntry = 'C:/app/node_modules/.nitro/vite/services/api/index.js';
    const nitro = createNitro({
      virtual: { [VITE_SERVICES_ID]: () => viteServicesTemplate({ ssr: SSR_ENTRY, api: windowsEntry }) },
    });
    plugin.nitro.setup(nitro);
    writeServiceBundle(plugin, 'ssr', ['react']);
    writeServiceBundle(plugin, 'api');

    const code = await renderVirtualModule(nitro);

    expect(code).toContain('await Promise.race(');
    expect(code).toContain(`import(${JSON.stringify(SSR_ENTRY)})`);
    expect(code).toContain(`import(${JSON.stringify(windowsEntry)})`);
  });

  it('does not preload server environments that are not Nitro services', async () => {
    const plugin = makePreloadNitroServerEntryPlugin();
    const nitro = createNitro({ virtual: { [VITE_SERVICES_ID]: viteServicesTemplate({ ssr: SSR_ENTRY }) } });
    plugin.nitro.setup(nitro);
    writeServiceBundle(plugin, 'ssr');
    writeServiceBundle(plugin, 'rsc');

    const code = await renderVirtualModule(nitro);

    expect(code.match(/import\(/g)).toHaveLength(1);
    expect(code).not.toContain('rsc');
  });

  it.each(['nitro', 'nitro/app', '#nitro/virtual/app', '/app/node_modules/nitro/dist/runtime/app.mjs'])(
    'does not await a service that imports the Nitro runtime (%s)',
    async nitroImport => {
      const plugin = makePreloadNitroServerEntryPlugin();
      const nitro = createNitro({ virtual: { [VITE_SERVICES_ID]: viteServicesTemplate({ ssr: SSR_ENTRY }) } });
      plugin.nitro.setup(nitro);
      writeServiceBundle(plugin, 'ssr', [nitroImport]);

      const code = await renderVirtualModule(nitro);

      expect(code).not.toContain('await');
      expect(code).toContain(`import(${JSON.stringify(SSR_ENTRY)}).catch(() => {});`);
    },
  );

  it('does not await a service whose imports were not checked', async () => {
    const plugin = makePreloadNitroServerEntryPlugin();
    const nitro = createNitro({ virtual: { [VITE_SERVICES_ID]: viteServicesTemplate({ ssr: SSR_ENTRY }) } });
    plugin.nitro.setup(nitro);

    const code = await renderVirtualModule(nitro);

    expect(code).not.toContain('await');
    expect(code).toContain(`import(${JSON.stringify(SSR_ENTRY)})`);
  });

  it('preloads nothing without the vite-services module of Nitro', async () => {
    const plugin = makePreloadNitroServerEntryPlugin();
    const nitro = createNitro();
    plugin.nitro.setup(nitro);
    writeServiceBundle(plugin, 'ssr');

    const code = await renderVirtualModule(nitro);

    expect(code).not.toContain('import(');
    expect(code).toContain('export default function');
  });
});

describe('readViteServices', () => {
  it('reads the services with escaped characters in their paths', async () => {
    const entry = 'C:\\app\\services\\"ssr"\\index.js';

    await expect(readViteServices(viteServicesTemplate({ ssr: entry }))).resolves.toEqual([
      { name: 'ssr', file: entry },
    ]);
  });

  it('reads nothing from a template of another shape', async () => {
    await expect(readViteServices('export const viteServices = {};')).resolves.toEqual([]);
    await expect(readViteServices(undefined)).resolves.toEqual([]);
  });
});

describe('renderPreloadPlugin', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-tanstackstart-preload-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
  });
});
