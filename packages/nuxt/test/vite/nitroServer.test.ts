import type { Nuxt } from '@nuxt/schema';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupNitroServer } from '../../src/vite/nitroServer';

const addNitroPluginMock = vi.hoisted(() => vi.fn());
const addServerImportsMock = vi.hoisted(() => vi.fn());
const addTemplateMock = vi.hoisted(() => vi.fn());
const addServerTemplateMock = vi.hoisted(() => vi.fn());

vi.mock('@nuxt/kit', () => ({
  addNitroPlugin: addNitroPluginMock,
  addServerImports: addServerImportsMock,
  addTemplate: addTemplateMock,
  createResolver: () => ({ resolve: (input: string) => input }),
}));

vi.mock('../../src/vendor/server-template', () => ({
  addServerTemplate: addServerTemplateMock,
}));

const APP_ROOT = '/my/app';
const SERVER_CONFIG = `${APP_ROOT}/sentry.server.config.ts`;
const MODULE_OPTIONS = { experimental_entrypointWrappedFunctions: ['default', 'handler', 'server'] };

type HookCallback = (arg: unknown) => void;

function createFakeNuxt(): {
  nuxt: Nuxt;
  hook: ReturnType<typeof vi.fn>;
  callHook: (name: string, arg: unknown) => void;
} {
  const callbacks = new Map<string, HookCallback[]>();
  const hook = vi.fn((name: string, callback: HookCallback) => {
    callbacks.set(name, [...(callbacks.get(name) ?? []), callback]);
  });
  const nuxt = {
    options: { rootDir: APP_ROOT, buildDir: `${APP_ROOT}/.nuxt`, nitro: {} },
    hook,
    hooks: { hook },
  } as unknown as Nuxt;

  return { nuxt, hook, callHook: (name, arg) => callbacks.get(name)?.forEach(callback => callback(arg)) };
}

describe('setupNitroServer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    addTemplateMock.mockImplementation((opts: { filename: string }) => ({ dst: `${APP_ROOT}/.nuxt/${opts.filename}` }));
  });

  it('registers nothing on a host without Nitro', () => {
    const { nuxt, hook } = createFakeNuxt();

    setupNitroServer(nuxt, 'nuxt', SERVER_CONFIG, MODULE_OPTIONS);

    expect(addNitroPluginMock).not.toHaveBeenCalled();
    expect(addServerImportsMock).not.toHaveBeenCalled();
    expect(addTemplateMock).not.toHaveBeenCalled();
    expect(addServerTemplateMock).not.toHaveBeenCalled();
    expect(hook).not.toHaveBeenCalled();
  });

  it.each([
    {
      serverApi: 'nitro2',
      handler: 'handler-legacy.server',
      updateRouteName: 'update-route-name-legacy.server',
      storage: 'storage-legacy.server',
    },
    {
      serverApi: 'nitro3',
      handler: 'handler.server',
      updateRouteName: 'update-route-name.server',
      storage: 'storage.server',
    },
  ] as const)('registers the $handler plugins on $serverApi', ({ serverApi, handler, updateRouteName, storage }) => {
    const { nuxt } = createFakeNuxt();

    setupNitroServer(nuxt, serverApi, SERVER_CONFIG, MODULE_OPTIONS);

    expect(addNitroPluginMock).toHaveBeenCalledTimes(5);
    expect(addNitroPluginMock).toHaveBeenNthCalledWith(1, `${APP_ROOT}/.nuxt/sentry-server-config-plugin.mjs`);
    expect(addNitroPluginMock).toHaveBeenNthCalledWith(2, `./runtime/plugins/${handler}`);
    expect(addNitroPluginMock).toHaveBeenNthCalledWith(3, `./runtime/plugins/${updateRouteName}`);
    expect(addNitroPluginMock).toHaveBeenNthCalledWith(4, './runtime/plugins/sentry.server');
    expect(addNitroPluginMock).toHaveBeenNthCalledWith(5, `./runtime/plugins/${storage}`);
  });

  it('instruments the middleware and adds the config shim once Nitro initializes', () => {
    const { nuxt, callHook } = createFakeNuxt();
    const nitro = { options: { preset: 'node-server', plugins: [] }, hooks: { hook: vi.fn() } };
    setupNitroServer(nuxt, 'nitro2', SERVER_CONFIG, MODULE_OPTIONS);

    callHook('nitro:init', nitro);

    expect(nitro.hooks.hook).toHaveBeenCalledTimes(2);
    expect(nitro.hooks.hook).toHaveBeenCalledWith('rollup:before', expect.any(Function));
    expect(nitro.hooks.hook).toHaveBeenCalledWith('close', expect.any(Function));
  });
});
