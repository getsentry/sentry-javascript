import * as fs from 'fs';
import * as path from 'path';
import { webpack } from 'webpack';
import type { Configuration } from 'webpack';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sentryWebpackPlugin } from '../../src/webpack/index';
import type { Options } from '../../src/core';
import { createModuleVersionsProject, INJECTED_MODULES, runAndReadModules } from '../utils/module-versions-project';

describe('module versions injection (webpack)', () => {
  let root: string;

  beforeEach(() => {
    root = createModuleVersionsProject();
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function buildApp(target: Configuration['target'], options: Options = {}): Promise<string> {
    const outDir = path.join(root, 'dist');
    return new Promise((resolve, reject) => {
      webpack(
        {
          mode: 'none',
          context: root,
          target,
          entry: './entry.js',
          output: { path: outDir, filename: 'main.js' },
          plugins: [sentryWebpackPlugin({ telemetry: false, silent: true, release: { create: false }, ...options })],
        },
        (err, stats) => {
          if (err || !stats || stats.hasErrors()) {
            return reject(err ?? new Error(stats?.toString() ?? 'no stats'));
          }
          resolve(fs.readFileSync(path.join(outDir, 'main.js'), 'utf8'));
        },
      );
    });
  }

  it.each(['node', 'async-node', 'node18', ['node20', 'es2020']])(
    'injects into builds with the %j target',
    { timeout: 15_000 },
    async target => {
      expect(runAndReadModules(await buildApp(target))).toEqual(INJECTED_MODULES);
    },
  );

  it.each([undefined, 'web', 'webworker', ['web', 'es6']])(
    'does not inject into builds with the %j target',
    { timeout: 15_000 },
    async target => {
      expect(await buildApp(target)).not.toContain('__SENTRY_SERVER_MODULES__');
    },
  );

  it('does not inject with `injectModuleVersions: false`', { timeout: 15_000 }, async () => {
    expect(await buildApp('node', { injectModuleVersions: false })).not.toContain('__SENTRY_SERVER_MODULES__');
  });

  it('injects one copy into a runtime chunk that entries share', { timeout: 15_000 }, async () => {
    fs.writeFileSync(path.join(root, 'other.js'), 'console.log("other");\n');
    const outDir = path.join(root, 'dist');

    await new Promise<void>((resolve, reject) => {
      webpack(
        {
          mode: 'none',
          context: root,
          target: 'node',
          entry: { main: './entry.js', other: './other.js' },
          output: { path: outDir, filename: '[name].js' },
          optimization: { runtimeChunk: { name: 'runtime' } },
          plugins: [sentryWebpackPlugin({ telemetry: false, silent: true, release: { create: false } })],
        },
        (err, stats) => (err || !stats || stats.hasErrors() ? reject(err ?? new Error(stats?.toString())) : resolve()),
      );
    });

    const filesWithModules = fs
      .readdirSync(outDir)
      .filter(file => fs.readFileSync(path.join(outDir, file), 'utf8').includes('__SENTRY_SERVER_MODULES__'));
    expect(filesWithModules).toEqual(['runtime.js']);
  });
});
