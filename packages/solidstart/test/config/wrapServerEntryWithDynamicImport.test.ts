import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  QUERY_END_INDICATOR,
  SENTRY_REEXPORTED_FUNCTIONS,
  SENTRY_WRAPPED_ENTRY,
  toResolvablePath,
  wrapServerEntryWithDynamicImport,
} from '../../src/config/wrapServerEntryWithDynamicImport';

const configPath = '/project/instrument.server.ts';
const entryPath = '/project/.build/server/entry.mjs';

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

describe('wrapServerEntryWithDynamicImport', () => {
  const plugin = wrapServerEntryWithDynamicImport({
    serverConfigFileName: 'instrument.server',
    serverEntrypointFileName: 'entry',
    resolvedServerConfigPath: configPath,
    entrypointWrappedFunctions: ['handler'],
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

  it('does not mark backup or test config files as the server config', async () => {
    const backupPath = '/project/instrument.server.backup.ts';
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
