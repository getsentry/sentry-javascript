import type { Nitro } from 'nitropack';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addDynamicImportEntryFileWrapper,
  addInstrumentationFileToBuild,
  staticHostPresets,
} from '../../src/config/addInstrumentation';
import type { RollupConfig } from '../../src/config/types';

const consoleLogSpy = vi.spyOn(console, 'log');
const consoleWarnSpy = vi.spyOn(console, 'warn');
const fsAccessMock = vi.fn();
const fsCopyFileMock = vi.fn();
const fsReadFile = vi.fn();
const fsWriteFileMock = vi.fn();
const fsMkdirMock = vi.fn();
const fsReaddirMock = vi.fn();
const fsExistsSyncMock = vi.fn();

vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    existsSync: (...args: unknown[]) => fsExistsSyncMock(...args),
    promises: {
      // @ts-expect-error this exists
      ...actual.promises,
      access: (...args: unknown[]) => fsAccessMock(...args),
      copyFile: (...args: unknown[]) => fsCopyFileMock(...args),
      readFile: (...args: unknown[]) => fsReadFile(...args),
      writeFile: (...args: unknown[]) => fsWriteFileMock(...args),
      mkdir: (...args: unknown[]) => fsMkdirMock(...args),
      readdir: (...args: unknown[]) => fsReaddirMock(...args),
    },
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('addInstrumentationFileToBuild()', () => {
  const nitroOptions: Nitro = {
    hooks: {
      hook: vi.fn(),
    },
    options: {
      buildDir: '/path/to/buildDir',
      output: {
        serverDir: '/path/to/serverDir',
      },
      preset: 'vercel',
    },
  };

  const callNitroCloseHook = async () => {
    const hookCallback = nitroOptions.hooks.hook.mock.calls[0][1];
    await hookCallback();
  };

  it('adds `instrument.server.mjs` to the server output directory', async () => {
    fsCopyFileMock.mockResolvedValueOnce(true);
    await addInstrumentationFileToBuild(nitroOptions);

    await callNitroCloseHook();

    expect(fsCopyFileMock).toHaveBeenCalledWith(
      '/path/to/buildDir/build/ssr/instrument.server.js',
      '/path/to/serverDir/instrument.server.mjs',
    );
  });

  it('warns when `instrument.server.js` cannot be copied to the server output directory', async () => {
    const error = new Error('Failed to copy file.');
    fsCopyFileMock.mockRejectedValueOnce(error);
    await addInstrumentationFileToBuild(nitroOptions);

    await callNitroCloseHook();

    expect(fsCopyFileMock).toHaveBeenCalledWith(
      '/path/to/buildDir/build/ssr/instrument.server.js',
      '/path/to/serverDir/instrument.server.mjs',
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[Sentry SolidStart withSentry] Failed to add instrumentation file to build.',
      error,
    );
  });

  it.each(staticHostPresets)("doesn't add `instrument.server.mjs` for static host `%s`", async preset => {
    const staticNitroOptions = {
      ...nitroOptions,
      options: {
        ...nitroOptions.options,
        preset,
      },
    };

    await addInstrumentationFileToBuild(staticNitroOptions);

    await callNitroCloseHook();

    expect(fsCopyFileMock).not.toHaveBeenCalled();
  });

  it('creates assets directory if it does not exist', async () => {
    fsExistsSyncMock.mockReturnValue(false);
    fsMkdirMock.mockResolvedValueOnce(true);
    fsCopyFileMock.mockResolvedValueOnce(true);
    await addInstrumentationFileToBuild(nitroOptions);

    await callNitroCloseHook();

    expect(fsMkdirMock).toHaveBeenCalledWith('/path/to/serverDir/assets', { recursive: true });
    expect(consoleLogSpy).toHaveBeenCalledWith(
      '[Sentry SolidStart withSentry] Successfully created directory /path/to/serverDir/assets.',
    );
  });

  it('does not create assets directory if it already exists', async () => {
    fsExistsSyncMock.mockReturnValue(true);
    await addInstrumentationFileToBuild(nitroOptions);

    await callNitroCloseHook();

    expect(fsMkdirMock).not.toHaveBeenCalled();
  });

  it('does not copy release injection file source map file', async () => {
    fsExistsSyncMock.mockReturnValue(true);
    fsReaddirMock.mockResolvedValueOnce(['_sentry-release-injection-file-test.js.map']);
    fsCopyFileMock.mockResolvedValueOnce(true);
    await addInstrumentationFileToBuild(nitroOptions);

    await callNitroCloseHook();

    expect(fsCopyFileMock).not.toHaveBeenCalledWith(
      '/path/to/buildDir/build/ssr/assets/_sentry-release-injection-file-test.js.map',
      '/path/to/serverDir/assets/_sentry-release-injection-file-test.js.map',
    );
    expect(consoleLogSpy).not.toHaveBeenCalledWith(
      '[Sentry SolidStart withSentry] Successfully created /path/to/serverDir/assets/_sentry-release-injection-file-test.js.map.',
    );
  });

  it('copies release injection file if available', async () => {
    fsExistsSyncMock.mockReturnValue(true);
    fsReaddirMock.mockResolvedValueOnce(['_sentry-release-injection-file-test.js']);
    fsCopyFileMock.mockResolvedValueOnce(true);
    await addInstrumentationFileToBuild(nitroOptions);

    await callNitroCloseHook();

    expect(fsCopyFileMock).toHaveBeenCalledWith(
      '/path/to/buildDir/build/ssr/assets/_sentry-release-injection-file-test.js',
      '/path/to/serverDir/assets/_sentry-release-injection-file-test.js',
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      '[Sentry SolidStart withSentry] Successfully created /path/to/serverDir/assets/_sentry-release-injection-file-test.js.',
    );
  });

  it('warns when release injection file cannot be copied', async () => {
    const error = new Error('Failed to copy release injection file.');
    fsExistsSyncMock.mockReturnValue(true);
    fsReaddirMock.mockResolvedValueOnce(['_sentry-release-injection-file-test.js']);
    fsCopyFileMock.mockRejectedValueOnce(error);
    await addInstrumentationFileToBuild(nitroOptions);

    await callNitroCloseHook();

    expect(fsCopyFileMock).toHaveBeenCalledWith(
      '/path/to/buildDir/build/ssr/assets/_sentry-release-injection-file-test.js',
      '/path/to/serverDir/assets/_sentry-release-injection-file-test.js',
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[Sentry SolidStart withSentry] Failed to copy release injection file.',
      error,
    );
  });

  it('does not copy release injection file if not found', async () => {
    fsExistsSyncMock.mockReturnValue(true);
    fsReaddirMock.mockResolvedValueOnce([]);
    await addInstrumentationFileToBuild(nitroOptions);

    await callNitroCloseHook();

    expect(fsCopyFileMock).not.toHaveBeenCalledWith(
      expect.stringContaining('_sentry-release-injection-file-'),
      expect.any(String),
    );
  });

  it('warns when `instrument.server.js` is not found', async () => {
    const error = new Error('File not found');
    fsCopyFileMock.mockRejectedValueOnce(error);
    await addInstrumentationFileToBuild(nitroOptions);

    await callNitroCloseHook();

    expect(fsCopyFileMock).toHaveBeenCalledWith(
      '/path/to/buildDir/build/ssr/instrument.server.js',
      '/path/to/serverDir/instrument.server.mjs',
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[Sentry SolidStart withSentry] Failed to add instrumentation file to build.',
      error,
    );
  });
});

describe('addAutoInstrumentation()', () => {
  const nitroOptions: Nitro = {
    options: {
      srcDir: 'path/to/srcDir',
      buildDir: '/path/to/buildDir',
      output: {
        serverDir: '/path/to/serverDir',
      },
      preset: 'vercel',
    },
  };

  it('adds the `sentry-wrap-server-entry-with-dynamic-import` rollup plugin to the rollup config', async () => {
    const rollupConfig: RollupConfig = {
      plugins: [],
    };

    await addDynamicImportEntryFileWrapper({
      nitro: nitroOptions,
      rollupConfig,
      sentryPluginOptions: { experimental_entrypointWrappedFunctions: [] },
    });
    expect(
      rollupConfig.plugins.find(plugin => plugin.name === 'sentry-wrap-server-entry-with-dynamic-import'),
    ).toBeTruthy();
  });
});
