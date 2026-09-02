import type { Nuxt } from '@nuxt/schema';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addDevServerConfigFile,
  DEV_SERVER_CONFIG_PATH,
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

vi.mock('@nuxt/kit', () => ({
  addTemplate: addTemplateMock,
  // `@nuxt/kit` resolves rather than joins, which is what lets an absolute layer path win over the base.
  createResolver: (base: string) => ({ resolve: (input: string) => path.resolve(base, input) }),
}));

const APP_ROOT = '/my/monorepo/apps/web';
// `findDefaultSdkInitFile` always returns an absolute path, built from the layer's own `cwd`.
const APP_CONFIG = `${APP_ROOT}/sentry.server.config.ts`;
const LAYER_CONFIG = '/my/monorepo/layers/base/sentry.server.config.ts';

function generate(serverConfigFile: string): string {
  const nuxt = { options: { rootDir: APP_ROOT, buildDir: path.join(APP_ROOT, '.nuxt') } } as Nuxt;

  addDevServerConfigFile(nuxt, serverConfigFile);

  return addTemplateMock.mock.calls[0]?.[0].getContents();
}

describe('addDevServerConfigFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes the file into the build directory so `--import` can resolve it', () => {
    generate(APP_CONFIG);

    expect(addTemplateMock).toHaveBeenCalledWith({
      filename: DEV_SERVER_CONFIG_PATH,
      write: true,
      getContents: expect.any(Function),
    });
  });

  it('imports the user config as a file URL so Node can load it directly', () => {
    expect(generate(APP_CONFIG)).toContain(`await import(${JSON.stringify(pathToFileURL(APP_CONFIG).href)})`);
  });

  it('sets the dev flag before importing the config', () => {
    const contents = generate(APP_CONFIG);

    // A static import would be hoisted above the assignment and `Sentry.init()` would then see no flag.
    expect(contents).not.toMatch(/^import /m);
    expect(contents.indexOf('__SENTRY_NUXT_DEV_MODE__')).toBeLessThan(contents.indexOf('await import('));
  });

  it('catches a config Node cannot load, so a broken config does not stop the dev server', () => {
    const contents = generate(APP_CONFIG);

    expect(contents).toMatch(/try \{[\s\S]*await import\([\s\S]*\} catch \(error\) \{[\s\S]*console\.warn\(/);
    expect(contents).toContain('Could not load `sentry.server.config.ts`');
  });

  it('documents the command that preloads the file', () => {
    expect(generate(APP_CONFIG)).toContain("NODE_OPTIONS='--import ./.nuxt/dev/sentry.server.config.mjs'");
  });

  describe('when the config comes from a layer outside the project root', () => {
    it('imports the config from the layer it belongs to', () => {
      expect(generate(LAYER_CONFIG)).toContain(`await import(${JSON.stringify(pathToFileURL(LAYER_CONFIG).href)})`);
    });

    it('keeps the preload path relative to the project root', () => {
      // The file we generate always lives in the app's own build directory, wherever the config came from.
      expect(generate(LAYER_CONFIG)).toContain("NODE_OPTIONS='--import ./.nuxt/dev/sentry.server.config.mjs'");
    });
  });
});
