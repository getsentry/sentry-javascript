import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { EntryPlugin, webpack } from 'webpack';
import type { Compiler, Configuration, Stats } from 'webpack';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sentryWebpackPlugin } from '../../src/webpack/index';

function build(config: Configuration): Promise<Stats> {
  return new Promise((resolve, reject) => {
    webpack(config, (err, stats) => {
      if (err) {
        return reject(err);
      }
      if (!stats || stats.hasErrors()) {
        return reject(new Error(stats?.toString() ?? 'no stats'));
      }
      resolve(stats);
    });
  });
}

function createChildCompilerPlugin(context: string): { apply(compiler: Compiler): void } {
  return {
    apply(compiler) {
      compiler.hooks.make.tapAsync('test-child-compiler', (compilation, callback) => {
        const childCompiler = compilation.createChildCompiler('test-child-compiler', { filename: 'worker.js' }, [
          new EntryPlugin(context, './worker.js', { name: 'worker' }),
        ]);

        childCompiler.runAsChild(error => {
          if (error) {
            callback(error);
          } else {
            callback();
          }
        });
      });
    },
  };
}

describe('child compiler injection', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-webpack-child-compiler-'));
    fs.writeFileSync(path.join(tmpDir, 'entry.js'), 'globalThis.applicationLoaded = true;\n');
    fs.writeFileSync(path.join(tmpDir, 'worker.js'), 'globalThis.workerLoaded = true;\n');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('injects release information into child-compiler bundles', async () => {
    const outDir = path.join(tmpDir, 'dist');

    await build({
      mode: 'production',
      context: tmpDir,
      entry: './entry.js',
      output: { path: outDir, filename: 'bundle.js' },
      plugins: [
        sentryWebpackPlugin({
          release: { name: 'child-compiler-release' },
          sourcemaps: { disable: true },
          telemetry: false,
        }),
        createChildCompilerPlugin(tmpDir),
      ],
    });

    const workerBundle = fs.readFileSync(path.join(outDir, 'worker.js'), 'utf8');

    expect(workerBundle).toContain('child-compiler-release');
  });
});
