import type { RollupConfig } from 'vite';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Nitro } from '../../build/types/config/types';
import {
  addAutoInstrumentation,
  addInstrumentationFileToBuild,
  staticHostPresets,
} from '../../src/config/addInstrumentation';

const consoleLogSpy = vi.spyOn(console, 'log');
const consoleWarnSpy = vi.spyOn(console, 'warn');
const fsAccessMock = vi.fn();
const fsCopyFileMock = vi.fn();
const fsReadFile = vi.fn();
const fsWriteFileMock = vi.fn();

vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    promises: {
      // @ts-expect-error this exists
      ...actual.promises,
      access: (...args: unknown[]) => fsAccessMock(...args),
      copyFile: (...args: unknown[]) => fsCopyFileMock(...args),
      readFile: (...args: unknown[]) => fsReadFile(...args),
      writeFile: (...args: unknown[]) => fsWriteFileMock(...args),
    },
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('addInstrumentationFileToBuild()', () => {
  const nitroOptions: Nitro = {
    options: {
      buildDir: '/path/to/buildDir',
      output: {
        serverDir: '/path/to/serverDir',
      },
      preset: 'vercel',
    },
  };

  it('adds `instrument.server.mjs` to the server output directory', async () => {
    fsCopyFileMock.mockResolvedValueOnce(true);
    await addInstrumentationFileToBuild(nitroOptions);
    expect(fsCopyFileMock).toHaveBeenCalledWith(
      '/path/to/buildDir/build/ssr/instrument.server.js',
      '/path/to/serverDir/instrument.server.mjs',
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      '[Sentry SolidStart withSentry] Successfully created /path/to/serverDir/instrument.server.mjs.',
    );
  });

  it('warns when `instrument.server.js` can not be copied to the server output directory', async () => {
    const error = new Error('Failed to copy file.');
    fsCopyFileMock.mockRejectedValueOnce(error);
    await addInstrumentationFileToBuild(nitroOptions);
    expect(fsCopyFileMock).toHaveBeenCalledWith(
      '/path/to/buildDir/build/ssr/instrument.server.js',
      '/path/to/serverDir/instrument.server.mjs',
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[Sentry SolidStart withSentry] Failed to create /path/to/serverDir/instrument.server.mjs.',
      error,
    );
  });

  it.each([staticHostPresets])("doesn't add `instrument.server.mjs` for static host `%s`", async preset => {
    await addInstrumentationFileToBuild({
      ...nitroOptions,
      options: {
        ...nitroOptions.options,
        preset,
      },
    });
    expect(fsCopyFileMock).not.toHaveBeenCalled();
  });
});

describe('addAutoInstrumentation()', () => {
  const nitroOptions: Nitro = {
    options: {
      buildDir: '/path/to/buildDir',
      output: {
        serverDir: '/path/to/serverDir',
      },
      preset: 'vercel',
    },
  };

  it('adds the `sentry-solidstart-auto-instrument` rollup plugin to the rollup config', async () => {
    const rollupConfig: RollupConfig = {
      plugins: [],
    };

    await addAutoInstrumentation(nitroOptions, rollupConfig);
    expect(rollupConfig.plugins.find(plugin => plugin.name === 'sentry-solidstart-auto-instrument')).toBeTruthy();
  });
});
