import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Nitro } from '../../build/types/config/types';
import {
  addInstrumentationFileToBuild,
  experimental_addInstrumentationFileTopLevelImportToServerEntry,
  serverFilePresets,
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

describe('experimental_addInstrumentationFileTopLevelImportToServerEntry()', () => {
  it('adds a top level import of `instrument.server.mjs` to the index.mjs entry file', async () => {
    fsAccessMock.mockResolvedValueOnce(true);
    fsReadFile.mockResolvedValueOnce("import process from 'node:process';");
    fsWriteFileMock.mockResolvedValueOnce(true);
    await experimental_addInstrumentationFileTopLevelImportToServerEntry('/path/to/serverDir', 'node_server');
    expect(fsWriteFileMock).toHaveBeenCalledWith(
      '/path/to/serverDir/index.mjs',
      "import './instrument.server.mjs';\nimport process from 'node:process';",
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      '[Sentry SolidStart withSentry] Added `/path/to/serverDir/instrument.server.mjs` as top level import to `/path/to/serverDir/index.mjs`.',
    );
  });

  it.each([serverFilePresets])(
    'adds a top level import of `instrument.server.mjs` to the server.mjs entry file for preset `%s`',
    async preset => {
      fsAccessMock.mockResolvedValueOnce(true);
      fsReadFile.mockResolvedValueOnce("import process from 'node:process';");
      fsWriteFileMock.mockResolvedValueOnce(true);
      await experimental_addInstrumentationFileTopLevelImportToServerEntry('/path/to/serverDir', preset);
      expect(fsWriteFileMock).toHaveBeenCalledWith(
        '/path/to/serverDir/server.mjs',
        "import './instrument.server.mjs';\nimport process from 'node:process';",
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[Sentry SolidStart withSentry] Added `/path/to/serverDir/instrument.server.mjs` as top level import to `/path/to/serverDir/server.mjs`.',
      );
    },
  );

  it("doesn't modify the sever entry file if `instrumentation.server.mjs` is not found", async () => {
    const error = new Error('File not found.');
    fsAccessMock.mockRejectedValueOnce(error);
    await experimental_addInstrumentationFileTopLevelImportToServerEntry('/path/to/serverDir', 'node_server');
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[Sentry SolidStart withSentry] Failed to add `/path/to/serverDir/instrument.server.mjs` as top level import to `/path/to/serverDir/index.mjs`.',
      error,
    );
  });

  it.each([staticHostPresets])(
    "doesn't import `instrument.server.mjs` as top level import for host `%s`",
    async preset => {
      fsAccessMock.mockResolvedValueOnce(true);
      await experimental_addInstrumentationFileTopLevelImportToServerEntry('/path/to/serverDir', preset);
      expect(fsWriteFileMock).not.toHaveBeenCalled();
    },
  );
});
