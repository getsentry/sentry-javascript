import { fileURLToPath, pathToFileURL } from 'node:url';
import * as path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import type { NitroConfig } from 'nitropack';
import {
  addServerConfigShimWithWarning,
  addServerConfigPlugin,
  wrapEntryWithDynamicImport,
} from '../../src/vite/addServerConfig';
import {
  QUERY_END_INDICATOR,
  SENTRY_REEXPORTED_FUNCTIONS,
  SENTRY_WRAPPED_ENTRY,
  toResolvablePath,
} from '../../src/vite/utils';

const configPath = '/project/sentry.server.config.ts';
const entryPath = '/project/.nuxt/entry.mjs';

describe('toResolvablePath', () => {
  it('passes through non-file specifiers', () => {
    expect(toResolvablePath('./module')).toEqual({ path: './module', wasFileUrl: false });
    expect(toResolvablePath(configPath)).toEqual({ path: configPath, wasFileUrl: false });
  });

  it('converts file:// URLs to filesystem paths', () => {
    const url = pathToFileURL(entryPath).href;
    expect(toResolvablePath(url)).toEqual({ path: fileURLToPath(url), wasFileUrl: true });
  });

  it('returns undefined for malformed file:// URLs', () => {
    expect(toResolvablePath('file://')).toBeUndefined();
    expect(toResolvablePath('file:///')).toBeUndefined();
    expect(toResolvablePath('file://%E0%A4%A')).toBeUndefined();
  });
});

describe('wrapEntryWithDynamicImport', () => {
  const plugin = wrapEntryWithDynamicImport({
    resolvedSentryConfigPath: configPath,
    experimental_entrypointWrappedFunctions: ['handler'],
  }) as unknown as {
    resolveId: (source: string, importer: string | undefined, options: { isEntry?: boolean }) => Promise<unknown>;
    load: (id: string) => string | null;
  };
  const { resolveId, load } = plugin;

  it('emits file:// URLs from load() so Node resolves them on Windows', () => {
    const code = load.call({}, `\0raw${entryPath}${SENTRY_WRAPPED_ENTRY}${QUERY_END_INDICATOR}`);

    expect(code).toContain(`import ${JSON.stringify(pathToFileURL(configPath).href)}`);
    expect(code).toContain(`import(${JSON.stringify(pathToFileURL(entryPath).href)})`);
    expect(code).not.toContain(`import ${JSON.stringify(configPath)}`);
  });

  it('uses file:// URLs for re-exported functions', () => {
    const id = `\0raw${entryPath}${SENTRY_WRAPPED_ENTRY}${SENTRY_REEXPORTED_FUNCTIONS}handler${QUERY_END_INDICATOR}`;
    const code = load.call({}, id);

    expect(code).toContain(`export { handler } from ${JSON.stringify(pathToFileURL(entryPath).href)}`);
  });

  it('resolves a file:// config URL to a filesystem path with moduleSideEffects', async () => {
    const source = pathToFileURL(configPath).href;
    const result = await resolveId.call({ resolve: vi.fn(), load: vi.fn() }, source, undefined, { isEntry: false });

    expect(result).toEqual({ id: fileURLToPath(source), moduleSideEffects: true });
  });

  it('resolves a plain config path without converting it', async () => {
    const result = await resolveId.call({ resolve: vi.fn(), load: vi.fn() }, configPath, undefined, { isEntry: false });

    expect(result).toEqual({ id: configPath, moduleSideEffects: true });
  });

  it('does not mark backup or test config files as the Sentry server config', async () => {
    const backupPath = '/project/sentry.server.config.backup.ts';
    const result = await resolveId.call({ resolve: vi.fn(), load: vi.fn() }, backupPath, undefined, { isEntry: false });

    expect(result).toBeNull();
  });

  it('resolves file:// entry specifiers without re-entering the entry branch', async () => {
    const source = pathToFileURL(entryPath).href;
    const fakeResolve = vi.fn(async () => ({ id: 'resolved-id', external: false }));
    const result = await resolveId.call({ resolve: fakeResolve, load: vi.fn() }, source, undefined, { isEntry: false });

    expect(fakeResolve).toHaveBeenCalledWith(
      fileURLToPath(source),
      undefined,
      expect.objectContaining({ isEntry: false }),
    );
    expect(result).toEqual({ id: 'resolved-id', external: false });
  });

  it('returns null for malformed file:// URLs', async () => {
    const result = await resolveId.call({ resolve: vi.fn(), load: vi.fn() }, 'file://', undefined, { isEntry: false });

    expect(result).toBeNull();
  });

  it('wraps the entry with the dynamic-import query suffix', async () => {
    const fakeResolve = vi.fn(async () => ({ id: entryPath, external: false }));
    const fakeLoad = vi.fn(async () => ({ exportedBindings: { '.': ['handler'] }, moduleSideEffects: false }));
    const result = await resolveId.call({ resolve: fakeResolve, load: fakeLoad }, entryPath, undefined, {
      isEntry: true,
    });

    expect(result).toContain(SENTRY_WRAPPED_ENTRY);
    expect(result).toContain('?sentry-query-wrapped-functions=handler');
    expect(result?.startsWith('\0raw')).toBe(true);
  });
});

const addTemplateMock = vi.hoisted(() => vi.fn());
const addServerPluginMock = vi.hoisted(() => vi.fn());

vi.mock('@nuxt/kit', () => ({
  addTemplate: addTemplateMock,
  addServerPlugin: addServerPluginMock,
  // `@nuxt/kit` resolves rather than joins, which is what lets an absolute layer path win over the base.
  createResolver: (base: string) => ({ resolve: (input: string) => path.resolve(base, input) }),
}));

const APP_ROOT = '/my/monorepo/apps/web';
// `findDefaultSdkInitFile` always returns an absolute path, built from the layer's own `cwd`.
const APP_CONFIG = `${APP_ROOT}/sentry.server.config.ts`;

describe('addServerConfigPlugin', () => {
  const flagsDst = `${APP_ROOT}/.nuxt/sentry-runtime-flags.mjs`;
  const pluginDst = `${APP_ROOT}/.nuxt/sentry-server-config-plugin.mjs`;

  function createFakeNuxt(): {
    nuxt: Parameters<typeof addServerConfigPlugin>[0];
    hooks: Record<string, (nitroConfig: NitroConfig) => void>;
  } {
    const hooks: Record<string, (nitroConfig: NitroConfig) => void> = {};
    const nuxt = {
      options: { rootDir: APP_ROOT, buildDir: path.join(APP_ROOT, '.nuxt'), nitro: {} },
      hook: (name: string, callback: (nitroConfig: NitroConfig) => void) => {
        hooks[name] = callback;
      },
    } as unknown as Parameters<typeof addServerConfigPlugin>[0];

    return { nuxt, hooks };
  }

  function templateContents(filename: string): string {
    const call = addTemplateMock.mock.calls.find(args => args[0]?.filename === filename);
    expect(call).toBeDefined();
    return call?.[0].getContents();
  }

  beforeEach(() => {
    vi.clearAllMocks();
    addTemplateMock.mockImplementation((opts: { filename: string }) => ({
      dst: `${APP_ROOT}/.nuxt/${opts.filename}`,
    }));
  });

  it('registers a plugin that evaluates the runtime flags before the config', () => {
    const { nuxt } = createFakeNuxt();

    addServerConfigPlugin(nuxt, APP_CONFIG);

    expect(templateContents('sentry-server-config-plugin.mjs')).toBe(
      `import ${JSON.stringify(flagsDst)};\nimport ${JSON.stringify(APP_CONFIG)};\nexport default () => {};\n`,
    );
    expect(addServerPluginMock).toHaveBeenCalledWith(pluginDst);
  });

  it('derives the runtime flags from the build-time `import.meta` values', () => {
    const { nuxt } = createFakeNuxt();

    addServerConfigPlugin(nuxt, APP_CONFIG);

    const contents = templateContents('sentry-runtime-flags.mjs');
    expect(contents).toContain('globalThis.__SENTRY_NUXT_DEV_MODE__ = import.meta.dev === true;');
    expect(contents).toContain('globalThis.__SENTRY_NUXT_PRERENDER__ = import.meta.prerender === true;');
  });

  it('marks the config and the flags as side-effectful so tree shaking cannot drop them', () => {
    const { nuxt } = createFakeNuxt();
    nuxt.options.nitro.moduleSideEffects = ['unenv/polyfill/'];

    addServerConfigPlugin(nuxt, APP_CONFIG);

    expect(nuxt.options.nitro.moduleSideEffects).toEqual(['unenv/polyfill/', APP_CONFIG, flagsDst]);
  });

  it('inlines the config and both templates so the dev bundle transpiles them', () => {
    const { nuxt, hooks } = createFakeNuxt();
    addServerConfigPlugin(nuxt, APP_CONFIG);
    const nitroConfig: NitroConfig = { externals: { inline: ['@sentry/'] } };

    hooks['nitro:config']!(nitroConfig);

    expect(nitroConfig.externals?.inline).toEqual(['@sentry/', APP_CONFIG, pluginDst, flagsDst]);
  });

  it('moves its plugin to the front when other modules registered plugins first', () => {
    const { nuxt, hooks } = createFakeNuxt();
    addServerConfigPlugin(nuxt, APP_CONFIG);
    const nitroConfig: NitroConfig = { plugins: ['other-module-plugin.mjs', pluginDst] };

    hooks['nitro:config']!(nitroConfig);

    expect(nitroConfig.plugins).toEqual([pluginDst, 'other-module-plugin.mjs']);
  });

  it('removes the plugin and warns on Cloudflare presets instead of importing the Node SDK into workerd', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { nuxt, hooks } = createFakeNuxt();
    addServerConfigPlugin(nuxt, APP_CONFIG);
    const nitroConfig: NitroConfig = { preset: 'cloudflare_module', plugins: ['other-plugin.mjs', pluginDst] };

    hooks['nitro:config']!(nitroConfig);

    expect(nitroConfig.plugins).toEqual(['other-plugin.mjs']);
    expect(nitroConfig.externals).toBeUndefined();
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('sentryCloudflareNitroPlugin'));
    consoleWarnSpy.mockRestore();
  });
});

describe('addImportCompatShim', () => {
  function createFakeNitro(options: { dev?: boolean; preset?: string }): {
    nitro: Parameters<typeof addServerConfigShimWithWarning>[0];
    runCloseHook: () => Promise<void>;
  } {
    const hooks: Record<string, () => Promise<void>> = {};
    const nitro = {
      hooks: {
        hook: (name: string, callback: () => Promise<void>) => {
          hooks[name] = callback;
        },
      },
      options: {
        dev: options.dev ?? false,
        preset: options.preset ?? 'node-server',
        output: { serverDir: `${APP_ROOT}/.output/server` },
      },
    } as unknown as Parameters<typeof addServerConfigShimWithWarning>[0];

    return { nitro, runCloseHook: () => hooks['close']!() };
  }

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('writes the shim to the former config path after the build', async () => {
    const writeFileSpy = vi.spyOn(fs.promises, 'writeFile').mockResolvedValue();
    const { nitro, runCloseHook } = createFakeNitro({});

    addServerConfigShimWithWarning(nitro);
    await runCloseHook();

    expect(writeFileSpy).toHaveBeenCalledWith(
      `${APP_ROOT}/.output/server/sentry.server.config.mjs`,
      expect.stringContaining('no longer needed'),
      'utf8',
    );
  });

  it('does not write the shim for dev servers', async () => {
    const writeFileSpy = vi.spyOn(fs.promises, 'writeFile').mockResolvedValue();
    const { nitro, runCloseHook } = createFakeNitro({ dev: true });

    addServerConfigShimWithWarning(nitro);
    await runCloseHook();

    expect(writeFileSpy).not.toHaveBeenCalled();
  });

  it('does not write the shim into the prerenderer output', async () => {
    const writeFileSpy = vi.spyOn(fs.promises, 'writeFile').mockResolvedValue();
    const { nitro, runCloseHook } = createFakeNitro({ preset: 'nitro-prerender' });

    addServerConfigShimWithWarning(nitro);
    await runCloseHook();

    expect(writeFileSpy).not.toHaveBeenCalled();
  });

  it('does not write the shim for Cloudflare presets', async () => {
    const writeFileSpy = vi.spyOn(fs.promises, 'writeFile').mockResolvedValue();
    const { nitro, runCloseHook } = createFakeNitro({ preset: 'cloudflare_module' });

    addServerConfigShimWithWarning(nitro);
    await runCloseHook();

    expect(writeFileSpy).not.toHaveBeenCalled();
  });
});
