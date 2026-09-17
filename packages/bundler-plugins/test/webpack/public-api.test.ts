import type { WebpackPluginInstance } from 'webpack';
import { sentryWebpackPlugin } from '../../src/webpack';
import { describe, it, expect, test, vi } from 'vitest';

test('Webpack plugin should exist', () => {
  expect(sentryWebpackPlugin).toBeDefined();
  expect(typeof sentryWebpackPlugin).toBe('function');
});

type PluginClass = new (options: unknown) => unknown;

type Compiler = {
  options: { plugins: unknown[] };
  hooks: Record<string, Record<string, ReturnType<typeof vi.fn>>>;
  webpack?: { BannerPlugin: PluginClass; DefinePlugin: PluginClass };
};

class BannerPlugin {
  public constructor(public options: unknown) {}
}

class DefinePlugin {
  public constructor(public options: unknown) {}
}

function createCompiler(webpack?: Compiler['webpack']): Compiler {
  return {
    options: { plugins: [] },
    hooks: {
      thisCompilation: { tap: vi.fn() },
      afterEmit: { tapAsync: vi.fn() },
      done: { tap: vi.fn() },
    },
    webpack,
  };
}

describe('sentryWebpackPlugin', () => {
  it('returns a webpack plugin', () => {
    const plugin = sentryWebpackPlugin({
      authToken: 'test-token',
      org: 'test-org',
      project: 'test-project',
    }) as WebpackPluginInstance;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    expect(plugin).toEqual({ apply: expect.any(Function) });
  });

  it('registers the plugin classes provided by `compiler.webpack`', () => {
    const compiler = createCompiler({ BannerPlugin, DefinePlugin });

    sentryWebpackPlugin({ telemetry: false, release: { name: 'my-release' } }).apply(compiler);

    expect(compiler.options.plugins).toEqual([expect.any(BannerPlugin)]);
  });

  it('warns instead of throwing when `compiler.webpack` is unavailable', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const compiler = createCompiler(undefined);

    expect(() =>
      sentryWebpackPlugin({ telemetry: false, release: { name: 'my-release' } }).apply(compiler),
    ).not.toThrow();

    expect(compiler.options.plugins).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('BannerPlugin is not available'));
    warn.mockRestore();
  });
});
