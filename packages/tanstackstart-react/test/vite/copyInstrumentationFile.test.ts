import * as fs from 'fs';
import * as path from 'path';
import type { Plugin, ResolvedConfig } from 'vite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeCopyInstrumentationFilePlugin } from '../../src/vite/copyInstrumentationFile';

vi.mock('fs', () => ({
  promises: {
    access: vi.fn(),
    mkdir: vi.fn(),
    copyFile: vi.fn(),
  },
}));

type AnyFunction = (...args: unknown[]) => unknown;

function createNitroConfig(overrides?: Partial<ResolvedConfig>): ResolvedConfig {
  return {
    root: '/project',
    plugins: [{ name: 'nitro' }],
    environments: {
      nitro: {
        build: {
          rollupOptions: {
            output: { dir: '/project/.output/server' },
          },
        },
      },
    },
    ...overrides,
  } as unknown as ResolvedConfig;
}

describe('makeCopyInstrumentationFilePlugin()', () => {
  let plugin: Plugin;

  beforeEach(() => {
    vi.clearAllMocks();
    plugin = makeCopyInstrumentationFilePlugin();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('configResolved', () => {
    it('detects Nitro environment and reads output dir', () => {
      const resolvedConfig = createNitroConfig();

      (plugin.configResolved as AnyFunction)(resolvedConfig);

      // Verify by calling closeBundle - it should attempt to access the file
      vi.mocked(fs.promises.access).mockRejectedValueOnce(new Error('ENOENT'));
      (plugin.closeBundle as AnyFunction)();

      expect(fs.promises.access).toHaveBeenCalled();
    });

    it.each(['cloudflare', 'netlify'])('detects %s plugin and sets dist/server as output dir', pluginName => {
      const resolvedConfig = {
        root: '/project',
        plugins: [{ name: pluginName }],
      } as unknown as ResolvedConfig;

      (plugin.configResolved as AnyFunction)(resolvedConfig);

      vi.mocked(fs.promises.access).mockRejectedValueOnce(new Error('ENOENT'));
      (plugin.closeBundle as AnyFunction)();

      expect(fs.promises.access).toHaveBeenCalled();
    });

    it('logs a warning and does not set output dir when no recognized plugin is detected', () => {
      const resolvedConfig = {
        root: '/project',
        plugins: [{ name: 'some-other-plugin' }],
      } as unknown as ResolvedConfig;

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      (plugin.configResolved as AnyFunction)(resolvedConfig);

      (plugin.closeBundle as AnyFunction)();

      expect(warnSpy).toHaveBeenCalledWith(
        '[Sentry] Could not detect nitro, cloudflare, or netlify vite plugin. ' +
          'The instrument.server.mjs file will not be copied to the build output automatically.',
      );
      expect(fs.promises.access).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it('uses serverOutputDir option when provided, bypassing auto-detection', () => {
      const customPlugin = makeCopyInstrumentationFilePlugin({ serverOutputDir: 'build/custom-server' });

      const resolvedConfig = {
        root: '/project',
        plugins: [{ name: 'some-other-plugin' }],
      } as unknown as ResolvedConfig;

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      (customPlugin.configResolved as AnyFunction)(resolvedConfig);

      // No warning should be logged since serverOutputDir is provided
      expect(warnSpy).not.toHaveBeenCalled();

      vi.mocked(fs.promises.access).mockRejectedValueOnce(new Error('ENOENT'));
      (customPlugin.closeBundle as AnyFunction)();

      // Should attempt to access the file (indicating serverOutputDir was set)
      expect(fs.promises.access).toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it('serverOutputDir option overrides auto-detected Nitro output dir', async () => {
      const customPlugin = makeCopyInstrumentationFilePlugin({ serverOutputDir: 'custom/output' });

      const resolvedConfig = createNitroConfig();

      (customPlugin.configResolved as AnyFunction)(resolvedConfig);

      vi.mocked(fs.promises.access).mockResolvedValueOnce(undefined);
      vi.mocked(fs.promises.mkdir).mockResolvedValueOnce(undefined);
      vi.mocked(fs.promises.copyFile).mockResolvedValueOnce(undefined);

      await (customPlugin.closeBundle as AnyFunction)();

      // Should use the custom serverOutputDir, not Nitro's auto-detected dir
      expect(fs.promises.mkdir).toHaveBeenCalledWith(path.resolve('/project', 'custom/output'), { recursive: true });
      expect(fs.promises.copyFile).toHaveBeenCalledWith(
        path.resolve(process.cwd(), 'instrument.server.mjs'),
        path.resolve('/project', 'custom/output', 'instrument.server.mjs'),
      );
    });
  });

  describe('closeBundle', () => {
    it('copies instrumentation file when it exists and output dir is set', async () => {
      const resolvedConfig = createNitroConfig();

      (plugin.configResolved as AnyFunction)(resolvedConfig);

      vi.mocked(fs.promises.access).mockResolvedValueOnce(undefined);
      vi.mocked(fs.promises.mkdir).mockResolvedValueOnce(undefined);
      vi.mocked(fs.promises.copyFile).mockResolvedValueOnce(undefined);

      await (plugin.closeBundle as AnyFunction)();

      expect(fs.promises.access).toHaveBeenCalledWith(path.resolve(process.cwd(), 'instrument.server.mjs'));
      expect(fs.promises.mkdir).toHaveBeenCalledWith('/project/.output/server', { recursive: true });
      expect(fs.promises.copyFile).toHaveBeenCalledWith(
        path.resolve(process.cwd(), 'instrument.server.mjs'),
        path.resolve('/project/.output/server', 'instrument.server.mjs'),
      );
    });

    it('does nothing when no server output dir is detected', async () => {
      const resolvedConfig = {
        root: '/project',
        plugins: [{ name: 'some-other-plugin' }],
      } as unknown as ResolvedConfig;

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      (plugin.configResolved as AnyFunction)(resolvedConfig);

      await (plugin.closeBundle as AnyFunction)();

      expect(fs.promises.access).not.toHaveBeenCalled();
      expect(fs.promises.copyFile).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it('warns and does not copy when instrumentation file does not exist', async () => {
      const resolvedConfig = createNitroConfig();

      (plugin.configResolved as AnyFunction)(resolvedConfig);

      vi.mocked(fs.promises.access).mockRejectedValueOnce(new Error('ENOENT'));

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await (plugin.closeBundle as AnyFunction)();

      expect(fs.promises.access).toHaveBeenCalled();
      expect(fs.promises.copyFile).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        '[Sentry] No instrument.server.mjs file found in project root. ' +
          'The Sentry instrumentation file will not be copied to the build output.',
      );

      warnSpy.mockRestore();
    });

    it('logs a warning when copy fails', async () => {
      const resolvedConfig = createNitroConfig();

      (plugin.configResolved as AnyFunction)(resolvedConfig);

      vi.mocked(fs.promises.access).mockResolvedValueOnce(undefined);
      vi.mocked(fs.promises.mkdir).mockResolvedValueOnce(undefined);
      vi.mocked(fs.promises.copyFile).mockRejectedValueOnce(new Error('Permission denied'));

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await (plugin.closeBundle as AnyFunction)();

      expect(warnSpy).toHaveBeenCalledWith(
        '[Sentry] Failed to copy instrument.server.mjs to build output.',
        expect.any(Error),
      );
    });

    it('uses custom instrumentation file path when provided', async () => {
      const customPlugin = makeCopyInstrumentationFilePlugin({
        instrumentationFilePath: 'custom/path/my-instrument.mjs',
      });

      const resolvedConfig = createNitroConfig();

      (customPlugin.configResolved as AnyFunction)(resolvedConfig);

      vi.mocked(fs.promises.access).mockResolvedValueOnce(undefined);
      vi.mocked(fs.promises.mkdir).mockResolvedValueOnce(undefined);
      vi.mocked(fs.promises.copyFile).mockResolvedValueOnce(undefined);

      await (customPlugin.closeBundle as AnyFunction)();

      expect(fs.promises.access).toHaveBeenCalledWith(path.resolve(process.cwd(), 'custom/path/my-instrument.mjs'));
      expect(fs.promises.copyFile).toHaveBeenCalledWith(
        path.resolve(process.cwd(), 'custom/path/my-instrument.mjs'),
        path.resolve('/project/.output/server', 'my-instrument.mjs'),
      );
    });

    it('warns with custom file name when custom instrumentation file is not found', async () => {
      const customPlugin = makeCopyInstrumentationFilePlugin({ instrumentationFilePath: 'custom/my-instrument.mjs' });

      const resolvedConfig = createNitroConfig();

      (customPlugin.configResolved as AnyFunction)(resolvedConfig);

      vi.mocked(fs.promises.access).mockRejectedValueOnce(new Error('ENOENT'));

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await (customPlugin.closeBundle as AnyFunction)();

      expect(warnSpy).toHaveBeenCalledWith(
        '[Sentry] No custom/my-instrument.mjs file found in project root. ' +
          'The Sentry instrumentation file will not be copied to the build output.',
      );
      expect(fs.promises.copyFile).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });
  });
});
