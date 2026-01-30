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
        plugins: [{ name: 'nitro' }],
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
        plugins: [{ name: 'nitro' }],
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
        plugins: [{ name: 'cloudflare' }],
      } as unknown as ResolvedConfig;

      (plugin.configResolved as AnyFunction)(resolvedConfig);

      vi.mocked(fs.promises.access).mockRejectedValueOnce(new Error('ENOENT'));
      (plugin.closeBundle as AnyFunction)();

      expect(fs.promises.access).toHaveBeenCalled();
    });

    it('detects Netlify plugin and sets dist/server as output dir', () => {
      const resolvedConfig = {
        root: '/project',
        plugins: [{ name: 'netlify' }],
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
        '[Sentry TanStack Start] Could not detect nitro, cloudflare, or netlify vite plugin. ' +
          'The instrument.server.mjs file will not be copied to the build output automatically.',
      );
      expect(fs.promises.access).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });
  });

  describe('closeBundle', () => {
    it('copies instrumentation file when it exists and output dir is set', async () => {
      const resolvedConfig = {
        root: '/project',
        plugins: [{ name: 'nitro' }],
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

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      (plugin.configResolved as AnyFunction)(resolvedConfig);

      await (plugin.closeBundle as AnyFunction)();

      expect(fs.promises.access).not.toHaveBeenCalled();
      expect(fs.promises.copyFile).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it('warns and does not copy when instrumentation file does not exist', async () => {
      const resolvedConfig = {
        root: '/project',
        plugins: [{ name: 'nitro' }],
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

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await (plugin.closeBundle as AnyFunction)();

      expect(fs.promises.access).toHaveBeenCalled();
      expect(fs.promises.copyFile).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        '[Sentry TanStack Start] No instrument.server.mjs file found in project root. ' +
          'The Sentry instrumentation file will not be copied to the build output.',
      );

      warnSpy.mockRestore();
    });

    it('logs a warning when copy fails', async () => {
      const resolvedConfig = {
        root: '/project',
        plugins: [{ name: 'nitro' }],
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
    });

    it('uses custom instrumentation file path when provided', async () => {
      const customPlugin = makeCopyInstrumentationFilePlugin('custom/path/my-instrument.mjs');

      const resolvedConfig = {
        root: '/project',
        plugins: [{ name: 'nitro' }],
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

      (customPlugin.configResolved as AnyFunction)(resolvedConfig);

      vi.mocked(fs.promises.access).mockResolvedValueOnce(undefined);
      vi.mocked(fs.promises.mkdir).mockResolvedValueOnce(undefined);
      vi.mocked(fs.promises.copyFile).mockResolvedValueOnce(undefined);

      await (customPlugin.closeBundle as AnyFunction)();

      expect(fs.promises.access).toHaveBeenCalledWith(
        path.resolve(process.cwd(), 'custom/path/my-instrument.mjs'),
        fs.constants.F_OK,
      );
      expect(fs.promises.copyFile).toHaveBeenCalledWith(
        path.resolve(process.cwd(), 'custom/path/my-instrument.mjs'),
        path.resolve('/project/.output/server', 'my-instrument.mjs'),
      );
    });

    it('warns with custom file name when custom instrumentation file is not found', async () => {
      const customPlugin = makeCopyInstrumentationFilePlugin('custom/my-instrument.mjs');

      const resolvedConfig = {
        root: '/project',
        plugins: [{ name: 'nitro' }],
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

      (customPlugin.configResolved as AnyFunction)(resolvedConfig);

      vi.mocked(fs.promises.access).mockRejectedValueOnce(new Error('ENOENT'));

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await (customPlugin.closeBundle as AnyFunction)();

      expect(warnSpy).toHaveBeenCalledWith(
        '[Sentry TanStack Start] No custom/my-instrument.mjs file found in project root. ' +
          'The Sentry instrumentation file will not be copied to the build output.',
      );
      expect(fs.promises.copyFile).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });
  });
});
