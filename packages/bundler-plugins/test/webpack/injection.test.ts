import webpack from 'webpack';
import MagicString from 'magic-string';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { sentryWebpackPlugin } from '../../src/webpack';

interface TestChunk {
  files: string[];
  hash?: string;
}

function runWebpackSourceInjection(
  assetName: string,
  source: webpack.sources.Source,
  chunks: TestChunk[] = [{ files: [assetName] }],
): webpack.sources.Source {
  const webpackPlugin = sentryWebpackPlugin({
    release: { inject: false },
    telemetry: false,
  });
  let compilationCallback!: (compilation: unknown) => void;
  let processAssets!: (assets: Record<string, webpack.sources.Source>) => void;
  const assets = { [assetName]: source };
  const compiler = {
    options: { plugins: [] as unknown[] },
    webpack: {
      Compilation: { PROCESS_ASSETS_STAGE_ADDITIONS: -100 },
      sources: { ReplaceSource: webpack.sources.ReplaceSource },
    },
    hooks: {
      compilation: {
        tap: (_name: string, callback: (compilation: unknown) => void) => {
          compilationCallback = callback;
        },
      },
      afterEmit: { tapAsync: () => undefined },
      done: { tap: () => undefined },
    },
  };
  const compilation = {
    chunks,
    compiler: {},
    hooks: {
      processAssets: {
        tap: (_options: unknown, callback: (assets: Record<string, webpack.sources.Source>) => void) => {
          processAssets = callback;
        },
      },
    },
    updateAsset: (name: string, updatedSource: webpack.sources.Source) => {
      assets[name] = updatedSource;
    },
  };

  webpackPlugin.apply(compiler as never);
  compilationCallback(compilation);
  processAssets(assets);

  return assets[assetName];
}

function runWebpackInjection(assetName: string, code: string, chunks?: TestChunk[]): string {
  return runWebpackSourceInjection(assetName, new webpack.sources.RawSource(code), chunks).source().toString();
}

describe('sentryWebpackPlugin', () => {
  it('preserves a top-level strict mode directive', () => {
    const code = '"use strict";\nglobalThis.strictModePreserved = (function () { return this; })() === undefined;';
    const output = runWebpackInjection('120.js', code);
    const context: { strictModePreserved?: boolean; _sentryDebugIds?: Record<string, string> } = {};

    runInNewContext(output, context);

    expect(context.strictModePreserved).toBe(true);
    expect(Object.keys(context._sentryDebugIds ?? {})).toHaveLength(1);
  });

  it('preserves source mappings when injecting after a directive prologue', () => {
    const code = '"use strict";\nglobalThis.applicationStarted = true;';
    const inputMap = new MagicString(code).generateMap({
      source: 'application.js',
      hires: 'boundary',
      includeContent: true,
    });
    const source = new webpack.sources.SourceMapSource(code, 'bundle.js', inputMap.toString());

    const output = runWebpackSourceInjection('bundle.js', source);
    const outputMap = output.map();

    expect(outputMap?.sources).toEqual(['application.js']);
    expect(outputMap?.sourcesContent).toEqual([code]);
    expect(outputMap?.mappings).toBe('AAAA,CAAC,GAAG,CAAC,MAAM,CAAC;AACZ,+YAAU,CAAC,kBAAkB,CAAC,CAAC,CAAC,IAAI');
  });

  it('derives the debug ID from the Webpack chunk hash', () => {
    const output = runWebpackSourceInjection(
      'bundle.js',
      new webpack.sources.RawSource('globalThis.bundleLoaded = true;'),
      [{ files: ['bundle.js'], hash: 'stable-webpack-chunk-hash' }],
    )
      .source()
      .toString();

    expect(output).toContain('sentry-dbid-1924c426-ebb3-47c2-8293-ea326e499bcc');
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

  it.each(['.ts', '.tsx', '.jsx', '.mts', '.cts'])('injects into a %s asset', extension => {
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

  it('injects into an asset shared by multiple chunks once', () => {
    const output = runWebpackInjection('shared.js', 'globalThis.bundleLoaded = true;', [
      { files: ['shared.js'], hash: 'first-chunk-hash' },
      { files: ['shared.js'], hash: 'second-chunk-hash' },
    ]);

    expect(output.match(/_sentryDebugIdIdentifier/g)).toHaveLength(1);
  });
});
