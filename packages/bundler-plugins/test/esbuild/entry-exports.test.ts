import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runInNewContext } from 'node:vm';
import * as esbuild from 'esbuild';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { sentryEsbuildPlugin } from '../../src/esbuild';

describe('entry point exports', () => {
  let tmpDir: string;
  let entry: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-esbuild-entry-exports-'));
    entry = path.join(tmpDir, 'entry.js');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it.each([
    ['an empty ES module', 'export {};', { default: undefined }],
    ['a script without exports', '', { default: {} }],
    ['named exports', 'export const answer = 42;', { answer: 42, default: undefined }],
    ['a default export', 'export default 42;', { default: 42 }],
    ['named and default exports', 'export const answer = 42; export default 7;', { answer: 42, default: 7 }],
    ['CommonJS exports', 'module.exports = { answer: 42 };', { default: { answer: 42 } }],
  ])('preserves %s without warnings', async (_name, source, expectedExports) => {
    fs.writeFileSync(entry, `globalThis.entryRuns = (globalThis.entryRuns || 0) + 1;\n${source}`);

    const result = await esbuild.build({
      entryPoints: [entry],
      bundle: true,
      format: 'cjs',
      write: false,
      logLevel: 'silent',
      plugins: [sentryEsbuildPlugin({ telemetry: false, silent: true, sourcemaps: { disable: 'disable-upload' } })],
    });

    expect(result.warnings).toEqual([]);
    const output = result.outputFiles[0]!.text;
    expect(output).toContain('_sentryDebugIds');

    const module = { exports: {} };
    const context = { module, entryRuns: 0 };
    runInNewContext(output, context);
    expect(module.exports).toMatchObject(expectedExports);
    expect(context.entryRuns).toBe(1);
  });

  it('removes unused named exports when a downstream bundle imports only the default', async () => {
    const marker = 'UNUSED_EXPORT_PAYLOAD_';
    fs.writeFileSync(
      entry,
      `globalThis.entryRuns = (globalThis.entryRuns || 0) + 1;
       export const unused = ${JSON.stringify(marker + 'x'.repeat(10000))};
       export default 42;`,
    );
    const library = path.join(tmpDir, 'library.js');

    const libraryResult = await esbuild.build({
      entryPoints: [entry],
      outfile: library,
      bundle: true,
      minify: true,
      format: 'esm',
      logLevel: 'silent',
      plugins: [
        sentryEsbuildPlugin({
          telemetry: false,
          silent: true,
          release: { inject: false },
          sourcemaps: { disable: 'disable-upload' },
        }),
      ],
    });
    expect(libraryResult.warnings).toEqual([]);
    expect(fs.readFileSync(library, 'utf8')).toContain(marker);

    const consumerResult = await esbuild.build({
      stdin: {
        contents: 'import value from "./library.js"; globalThis.result = value;',
        resolveDir: tmpDir,
      },
      bundle: true,
      minify: true,
      format: 'iife',
      write: false,
      logLevel: 'silent',
    });
    expect(consumerResult.warnings).toEqual([]);
    const output = consumerResult.outputFiles[0]!.text;
    expect(output).not.toContain(marker);
    expect(output).toContain('_sentryDebugIds');

    const context = { result: undefined, entryRuns: 0 };
    runInNewContext(output, context);
    expect(context.result).toBe(42);
    expect(context.entryRuns).toBe(1);
  });

  it('still reports missing exports accessed by user code', async () => {
    fs.writeFileSync(path.join(tmpDir, 'named.js'), 'export const answer = 42;');
    fs.writeFileSync(
      entry,
      'import * as named from "./named.js"; globalThis.value = named.missing; export default 42;',
    );

    const result = await esbuild.build({
      entryPoints: [entry],
      absWorkingDir: tmpDir,
      bundle: true,
      write: false,
      logLevel: 'silent',
      plugins: [sentryEsbuildPlugin({ telemetry: false, silent: true, sourcemaps: { disable: 'disable-upload' } })],
    });

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatchObject({
      id: 'import-is-undefined',
      location: { file: 'entry.js' },
    });
  });

  it('preserves output paths with multiple entry points and an explicit outbase', async () => {
    for (const name of ['one', 'two']) {
      const dir = path.join(tmpDir, 'src', name);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'index.js'), 'export default 42;');
    }

    const result = await esbuild.build({
      absWorkingDir: tmpDir,
      entryPoints: ['src/one/index.js', 'src/two/index.js'],
      outbase: 'src',
      outdir: 'dist',
      bundle: true,
      format: 'esm',
      write: false,
      logLevel: 'silent',
      plugins: [sentryEsbuildPlugin({ telemetry: false, silent: true, sourcemaps: { disable: 'disable-upload' } })],
    });

    expect(result.warnings).toEqual([]);
    expect(result.outputFiles.map(file => path.relative(tmpDir, file.path)).sort()).toEqual([
      path.join('dist', 'one', 'index.js'),
      path.join('dist', 'two', 'index.js'),
    ]);
  });
});
