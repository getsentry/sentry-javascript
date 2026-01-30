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
  constants: {
    F_OK: 0,
  },
}));

type AnyFunction = (...args: unknown[]) => unknown;

describe('makeCopyInstrumentationFilePlugin()', () => {
  let plugin: Plugin;

  beforeEach(() => {
    vi.clearAllMocks();
    plugin = makeCopyInstrumentationFilePlugin();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('has the correct plugin name', () => {
    expect(plugin.name).toBe('sentry-tanstackstart-copy-instrumentation-file');
  });

  it('applies only to build', () => {
    expect(plugin.apply).toBe('build');
  });

  it('enforces post', () => {
    expect(plugin.enforce).toBe('post');
  });

  describe('configResolved', () => {
    it('detects Nitro environment and reads output dir', () => {
      const resolvedConfig = {
        root: '/project',
        plugins: [],
        environments: {
          nitro: {
            build: {
              rollupOptions: {
                output: {
                  dir: '/project/.output/server',
                },
              },
            },
          },
        },
      } as unknown as ResolvedConfig;

      (plugin.configResolved as AnyFunction)(resolvedConfig);

      // Verify by calling closeBundle - it should attempt to access the file
      vi.mocked(fs.promises.access).mockRejectedValueOnce(new Error('ENOENT'));
      (plugin.closeBundle as AnyFunction)();

      expect(fs.promises.access).toHaveBeenCalled();
    });

    it('detects Nitro environment with array rollup output', () => {
      const resolvedConfig = {
        root: '/project',
        plugins: [],
        environments: {
          nitro: {
            build: {
              rollupOptions: {
                output: [{ dir: '/project/.output/server' }],
              },
            },
          },
        },
      } as unknown as ResolvedConfig;

      (plugin.configResolved as AnyFunction)(resolvedConfig);

      vi.mocked(fs.promises.access).mockRejectedValueOnce(new Error('ENOENT'));
      (plugin.closeBundle as AnyFunction)();

      expect(fs.promises.access).toHaveBeenCalled();
    });

    it('detects Cloudflare plugin and sets dist/server as output dir', () => {
      const resolvedConfig = {
        root: '/project',
        plugins: [{ name: 'vite-plugin-cloudflare' }],
      } as unknown as ResolvedConfig;

      (plugin.configResolved as AnyFunction)(resolvedConfig);

      vi.mocked(fs.promises.access).mockRejectedValueOnce(new Error('ENOENT'));
      (plugin.closeBundle as AnyFunction)();

      expect(fs.promises.access).toHaveBeenCalled();
    });

    it('detects Netlify plugin and sets dist/server as output dir', () => {
      const resolvedConfig = {
        root: '/project',
        plugins: [{ name: 'netlify-plugin' }],
      } as unknown as ResolvedConfig;

      (plugin.configResolved as AnyFunction)(resolvedConfig);

      vi.mocked(fs.promises.access).mockRejectedValueOnce(new Error('ENOENT'));
      (plugin.closeBundle as AnyFunction)();

      expect(fs.promises.access).toHaveBeenCalled();
    });

    it('does not set output dir when neither Nitro nor Cloudflare/Netlify is detected', () => {
      const resolvedConfig = {
        root: '/project',
        plugins: [{ name: 'some-other-plugin' }],
      } as unknown as ResolvedConfig;

      (plugin.configResolved as AnyFunction)(resolvedConfig);

      (plugin.closeBundle as AnyFunction)();

      expect(fs.promises.access).not.toHaveBeenCalled();
    });
  });

  describe('closeBundle', () => {
    it('copies instrumentation file when it exists and output dir is set', async () => {
      const resolvedConfig = {
        root: '/project',
        plugins: [],
        environments: {
          nitro: {
            build: {
              rollupOptions: {
                output: {
                  dir: '/project/.output/server',
                },
              },
            },
          },
        },
      } as unknown as ResolvedConfig;

      (plugin.configResolved as AnyFunction)(resolvedConfig);

      vi.mocked(fs.promises.access).mockResolvedValueOnce(undefined);
      vi.mocked(fs.promises.mkdir).mockResolvedValueOnce(undefined);
      vi.mocked(fs.promises.copyFile).mockResolvedValueOnce(undefined);

      await (plugin.closeBundle as AnyFunction)();

      expect(fs.promises.access).toHaveBeenCalledWith(
        path.resolve(process.cwd(), 'instrument.server.mjs'),
        fs.constants.F_OK,
      );
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

      (plugin.configResolved as AnyFunction)(resolvedConfig);

      await (plugin.closeBundle as AnyFunction)();

      expect(fs.promises.access).not.toHaveBeenCalled();
      expect(fs.promises.copyFile).not.toHaveBeenCalled();
    });

    it('does nothing when instrumentation file does not exist', async () => {
      const resolvedConfig = {
        root: '/project',
        plugins: [],
        environments: {
          nitro: {
            build: {
              rollupOptions: {
                output: {
                  dir: '/project/.output/server',
                },
              },
            },
          },
        },
      } as unknown as ResolvedConfig;

      (plugin.configResolved as AnyFunction)(resolvedConfig);

      vi.mocked(fs.promises.access).mockRejectedValueOnce(new Error('ENOENT'));

      await (plugin.closeBundle as AnyFunction)();

      expect(fs.promises.access).toHaveBeenCalled();
      expect(fs.promises.copyFile).not.toHaveBeenCalled();
    });

    it('logs a warning when copy fails', async () => {
      const resolvedConfig = {
        root: '/project',
        plugins: [],
        environments: {
          nitro: {
            build: {
              rollupOptions: {
                output: {
                  dir: '/project/.output/server',
                },
              },
            },
          },
        },
      } as unknown as ResolvedConfig;

      (plugin.configResolved as AnyFunction)(resolvedConfig);

      vi.mocked(fs.promises.access).mockResolvedValueOnce(undefined);
      vi.mocked(fs.promises.mkdir).mockResolvedValueOnce(undefined);
      vi.mocked(fs.promises.copyFile).mockRejectedValueOnce(new Error('Permission denied'));

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await (plugin.closeBundle as AnyFunction)();

      expect(warnSpy).toHaveBeenCalledWith(
        '[Sentry TanStack Start] Failed to copy instrument.server.mjs to build output.',
        expect.any(Error),
      );

      warnSpy.mockRestore();
    });
  });
});
