import type { Nuxt } from '@nuxt/schema';
import type { Plugin } from 'vite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupViteServer } from '../../src/vite/viteServer';

const addVitePluginMock = vi.hoisted(() => vi.fn());
const addTemplateMock = vi.hoisted(() => vi.fn());

vi.mock('@nuxt/kit', () => ({
  addVitePlugin: addVitePluginMock,
  addTemplate: addTemplateMock,
  createResolver: (base: string) => ({ resolve: (input: string) => `${base}/${input}` }),
}));

vi.mock('@sentry/server-utils/orchestrion/vite', () => ({
  sentryOrchestrionPlugin: () => ({ name: 'sentry-orchestrion', applyToEnvironment: () => true }),
}));

const APP_ROOT = '/my/app';
const FLAGS_PATH = `${APP_ROOT}/.nuxt/sentry-runtime-flags.mjs`;
const CONFIG_PATH = `${APP_ROOT}/sentry.server.config.ts`;
const SERVER_ENTRY_ID = 'virtual:nuxt:.nuxt%2Fvite-server%2Fserver-handler.mjs';
const EXPERIMENTAL_WARNING =
  "[Sentry] Support for the Nuxt Vite server (`server.builder: 'vite'`) is experimental and can change in a minor release. The server SDK starts only in production builds that run on Node.js.";
const NOT_BUNDLED_WARNING =
  '[Sentry] Could not add the Sentry server config to the server build: no `ssr` module resolved from `#server-entry`. The server SDK does not start. Load the config with `node --import` instead.';

type ApplyToEnvironment = (environment: { name: string }) => boolean;
type TransformHandler = (code: string, id: string) => unknown;

function createFakeNuxt(options: { dev?: boolean; _prepare?: boolean } = {}): {
  nuxt: Nuxt;
  callHook: (name: string) => void;
} {
  const callbacks = new Map<string, () => void>();
  const nuxt = {
    options: { rootDir: APP_ROOT, dev: false, ...options },
    hook: (name: string, callback: () => void) => callbacks.set(name, callback),
  } as unknown as Nuxt;

  return { nuxt, callHook: name => callbacks.get(name)?.() };
}

function addedPlugins(): Plugin[] {
  return addVitePluginMock.mock.calls.map(([plugin]) => plugin as Plugin);
}

async function buildServerEntryPlugin(resolvedId: string | undefined): Promise<TransformHandler> {
  const plugin = addedPlugins()[0] as Plugin;
  const resolve = vi.fn().mockResolvedValue(resolvedId ? { id: resolvedId } : null);
  await (plugin.buildStart as (this: unknown) => Promise<void>).call({ resolve });

  const { handler } = plugin.transform as { order: string; handler: TransformHandler };
  return (code, id) => handler.call({}, code, id);
}

describe('setupViteServer', () => {
  beforeEach(() => {
    addTemplateMock.mockImplementation((opts: { filename: string }) => ({ dst: `${APP_ROOT}/.nuxt/${opts.filename}` }));
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('adds the server entry and orchestrion plugins to the server build', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    setupViteServer(createFakeNuxt().nuxt, 'sentry.server.config.ts', {});

    expect(addVitePluginMock).toHaveBeenCalledTimes(2);
    expect(addVitePluginMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ name: 'sentry-nuxt-server-entry' }),
      {
        client: false,
      },
    );
    expect(addVitePluginMock).toHaveBeenNthCalledWith(2, expect.objectContaining({ name: 'sentry-orchestrion' }), {
      client: false,
    });
  });

  it('imports the runtime flags and the config from the project root into the server entry', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    setupViteServer(createFakeNuxt().nuxt, 'sentry.server.config.ts', {});
    const transform = await buildServerEntryPlugin(SERVER_ENTRY_ID);

    const result = transform('export default {};', SERVER_ENTRY_ID);

    expect(result).toEqual({
      code: `import "${FLAGS_PATH}";import "${CONFIG_PATH}";export default {};`,
      map: null,
    });
  });

  it.each([
    { environment: 'ssr', applies: true },
    { environment: 'client', applies: false },
    { environment: 'nuxt_vite_server_cloudflare', applies: false },
  ])('applies both plugins to the $environment environment: $applies', ({ environment, applies }) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    setupViteServer(createFakeNuxt().nuxt, 'sentry.server.config.ts', {});

    const results = addedPlugins().map(plugin =>
      (plugin.applyToEnvironment as ApplyToEnvironment)({ name: environment }),
    );

    expect(results).toEqual([applies, applies]);
  });

  it('adds no orchestrion plugin when build-time instrumentation is off', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    setupViteServer(createFakeNuxt().nuxt, 'sentry.server.config.ts', { buildTimeInstrumentation: false });

    expect(addedPlugins().map(plugin => plugin.name)).toEqual(['sentry-nuxt-server-entry']);
  });

  it('warns once that the Vite server support is experimental', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    setupViteServer(createFakeNuxt().nuxt, 'sentry.server.config.ts', {});

    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy).toHaveBeenCalledWith(EXPERIMENTAL_WARNING);
  });

  it('only warns in dev mode, where the server SDK does not start', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    setupViteServer(createFakeNuxt({ dev: true }).nuxt, 'sentry.server.config.ts', {});

    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy).toHaveBeenCalledWith(EXPERIMENTAL_WARNING);
    expect(addVitePluginMock).not.toHaveBeenCalled();
  });

  it('does nothing while Nuxt prepares types', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    setupViteServer(createFakeNuxt({ _prepare: true }).nuxt, 'sentry.server.config.ts', {});

    expect(consoleWarnSpy).not.toHaveBeenCalled();
    expect(addVitePluginMock).not.toHaveBeenCalled();
  });

  it.each(['top-level-import', 'experimental_dynamic-import'] as const)(
    'warns about the deprecated `%s` mode and still bundles the config',
    injectMode => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      setupViteServer(createFakeNuxt().nuxt, 'sentry.server.config.ts', { autoInjectServerSentry: injectMode });

      expect(consoleWarnSpy).toHaveBeenCalledTimes(2);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        `[Sentry] \`autoInjectServerSentry: '${injectMode}'\` is deprecated and has no effect on the Vite server. The Sentry server config is bundled into the server build. Remove the option.`,
      );
      expect(addedPlugins().map(plugin => plugin.name)).toEqual(['sentry-nuxt-server-entry', 'sentry-orchestrion']);
    },
  );

  it('warns after the build when no module received the config import', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { nuxt, callHook } = createFakeNuxt();
    setupViteServer(nuxt, 'sentry.server.config.ts', {});
    await buildServerEntryPlugin(undefined);

    callHook('build:done');

    expect(consoleWarnSpy).toHaveBeenCalledTimes(2);
    expect(consoleWarnSpy).toHaveBeenLastCalledWith(NOT_BUNDLED_WARNING);
  });

  it('does not warn after the build when the server entry received the config import', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { nuxt, callHook } = createFakeNuxt();
    setupViteServer(nuxt, 'sentry.server.config.ts', {});
    const transform = await buildServerEntryPlugin(SERVER_ENTRY_ID);
    transform('export default {};', SERVER_ENTRY_ID);

    callHook('build:done');

    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy).toHaveBeenCalledWith(EXPERIMENTAL_WARNING);
  });

  it('leaves every other module unchanged', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    setupViteServer(createFakeNuxt().nuxt, 'sentry.server.config.ts', {});
    const transform = await buildServerEntryPlugin(SERVER_ENTRY_ID);

    const result = transform('export default {};', 'virtual:nuxt:.nuxt%2Fvite-server%2Fserver-entry.mjs');

    expect(result).toBeNull();
  });
});
