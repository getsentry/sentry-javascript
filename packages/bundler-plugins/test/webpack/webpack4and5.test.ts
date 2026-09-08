import webpack from 'webpack';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { sentryWebpackPluginFactory } from '../../src/webpack/webpack4and5';

function runWebpackInjection(assetName: string, code: string, chunkFiles: string[] = [assetName]): string {
  const webpackPlugin = sentryWebpackPluginFactory()({
    release: { inject: false },
    telemetry: false,
  });
  let compilationCallback!: (compilation: unknown) => void;
  let processAssets!: (assets: Record<string, webpack.sources.Source>) => void;
  let output: webpack.sources.Source = new webpack.sources.RawSource(code);
  const compiler = {
    options: { plugins: [] as unknown[] },
    webpack: {
      Compilation: { PROCESS_ASSETS_STAGE_ADDITIONS: -100 },
      sources: { ReplaceSource: webpack.sources.ReplaceSource },
    },
    hooks: {
      thisCompilation: {
        tap: (_name: string, callback: (compilation: unknown) => void) => {
          compilationCallback = callback;
        },
      },
      afterEmit: { tapAsync: () => undefined },
      done: { tap: () => undefined },
    },
  };
  const compilation = {
    chunks: [{ files: chunkFiles }],
    compiler: {},
    hooks: {
      processAssets: {
        tap: (_options: unknown, callback: (assets: Record<string, webpack.sources.Source>) => void) => {
          processAssets = callback;
        },
      },
    },
    updateAsset: (_name: string, source: webpack.sources.Source) => {
      output = source;
    },
  };

  webpackPlugin.apply(compiler as never);
  compilationCallback(compilation);
  processAssets({ [assetName]: new webpack.sources.RawSource(code) });

  return output.source().toString();
}

describe('sentryWebpackPluginFactory', () => {
  it('preserves a top-level strict mode directive', () => {
    const code = '"use strict";\nglobalThis.strictModePreserved = (function () { return this; })() === undefined;';
    const output = runWebpackInjection('120.js', code);
    const context: { strictModePreserved?: boolean; _sentryDebugIds?: Record<string, string> } = {};

    runInNewContext(output, context);

    expect(context.strictModePreserved).toBe(true);
    expect(Object.keys(context._sentryDebugIds ?? {})).toHaveLength(1);
  });

  it.each([
    ['a semicolonless directive', '"use strict"'],
    ['trailing whitespace', '"use strict"   '],
    ['a trailing block comment', '"use strict"/* trailing */'],
    ['a trailing line comment', '"use strict" // trailing'],
  ])('preserves a directive at EOF with %s', (_description, code) => {
    const output = runWebpackInjection('120.js', code);
    const context: { strictModePreserved?: boolean; _sentryDebugIds?: Record<string, string> } = {};

    runInNewContext(
      `${output}\nglobalThis.strictModePreserved = (function () { return this; })() === undefined;`,
      context,
    );

    expect(context.strictModePreserved).toBe(true);
    expect(Object.keys(context._sentryDebugIds ?? {})).toHaveLength(1);
  });

  it.each(['.ts', '.tsx', '.jsx'])('injects into a %s asset', extension => {
    const output = runWebpackInjection(`bundle${extension}`, 'globalThis.bundleLoaded = true;');
    const context: { _sentryDebugIds?: Record<string, string> } = {};

    runInNewContext(output, context);

    expect(Object.keys(context._sentryDebugIds ?? {})).toHaveLength(1);
  });

  it('does not inject into JavaScript assets outside chunks', () => {
    const code = 'globalThis.bundleLoaded = true;';
    const output = runWebpackInjection('copied.js', code, []);

    expect(output).toBe(code);
  });
});
