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
      expect(runAndReadModules(await buildApp(target))).toBeUndefined();
    },
  );

  it('does not inject with `injectModuleVersions: false`', { timeout: 15_000 }, async () => {
    expect(runAndReadModules(await buildApp('node', { injectModuleVersions: false }))).toBeUndefined();
  });
});
