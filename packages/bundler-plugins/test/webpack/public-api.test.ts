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
  webpack?: {
    DefinePlugin: PluginClass;
    Compilation: { PROCESS_ASSETS_STAGE_ADDITIONS: number };
    sources: { ReplaceSource: PluginClass };
  };
};

class DefinePlugin {
  public constructor(public options: unknown) {}
}

class ReplaceSource {
  public constructor(public source: unknown) {}
}

function createCompiler(webpack?: Compiler['webpack']): Compiler {
  return {
    options: { plugins: [] },
    hooks: {
      compilation: { tap: vi.fn() },
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

  it('registers code injection through the compilation hook', () => {
    const compiler = createCompiler({
      DefinePlugin,
      Compilation: { PROCESS_ASSETS_STAGE_ADDITIONS: -100 },
      sources: { ReplaceSource },
    });

    sentryWebpackPlugin({ telemetry: false, release: { name: 'my-release' } }).apply(compiler as never);

    expect(compiler.hooks.compilation?.tap).toHaveBeenCalledWith(
      'sentry-webpack-plugin-injection',
      expect.any(Function),
    );
  });

  it('warns instead of throwing when `compiler.webpack` is unavailable', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const compiler = createCompiler(undefined);

    expect(() =>
      sentryWebpackPlugin({ telemetry: false, release: { name: 'my-release' } }).apply(compiler as never),
    ).not.toThrow();

    expect(compiler.options.plugins).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Webpack sources are not available'));
    warn.mockRestore();
  });
});
