import { SDK_VERSION } from '@sentry/core';
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { afterAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../utils/runner';

// Each test writes its packages into a folder of its own, because the Bun integration tests run this suite in
// several projects at the same time.
function makeTempDir(): string {
  return mkdtempSync(join(__dirname, 'tmp-'));
}

describe('modulesIntegration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('CJS', async () => {
    await createRunner(__dirname, 'scenario.js')
      .expect({
        event: {
          modules: {
            express: expect.stringMatching(/^4\.\d+\.\d+$/),
            '@sentry/node': SDK_VERSION,
            // Declared in package.json and installed, but never loaded
            yargs: expect.stringMatching(/^18\.\d+\.\d+$/),
            // Not declared, but loaded by express, so it is in require.cache
            finalhandler: expect.stringMatching(/^\d+\.\d+\.\d+$/),
          },
        },
      })
      .start()
      .completed();
  });

  test('CJS with the isolated layouts of pnpm and Bun', async () => {
    const tempDir = makeTempDir();
    copyFileSync(join(__dirname, 'scenario-isolated.js'), join(tempDir, 'scenario-isolated.js'));
    const nodeModulesDir = join(tempDir, 'node_modules');
    for (const [storeDir, name, version, linked] of [
      ['.pnpm', 'pnpm-isolated-package', '1.2.3', true],
      // Only a dependency of the app uses this version, so it is not linked into `node_modules`
      ['.pnpm', 'pnpm-isolated-package', '1.0.0', false],
      ['.pnpm', '@pnpm-isolated/scoped-package', '2.3.4', true],
      ['.bun', 'bun-isolated-package', '4.5.6', true],
      ['.bun', '@bun-isolated/scoped-package', '5.6.7', true],
    ] as const) {
      const packageDir = join(nodeModulesDir, storeDir, `${name.replace('/', '+')}@${version}`, 'node_modules', name);
      mkdirSync(packageDir, { recursive: true });
      writeFileSync(join(packageDir, 'package.json'), JSON.stringify({ name, version }));
      writeFileSync(join(packageDir, 'index.js'), 'module.exports = {};');

      if (linked) {
        mkdirSync(dirname(join(nodeModulesDir, name)), { recursive: true });
        symlinkSync(packageDir, join(nodeModulesDir, name), 'junction');
      }
    }

    try {
      await createRunner(tempDir, 'scenario-isolated.js')
        .expect({
          event: {
            modules: {
              'pnpm-isolated-package': '1.2.3',
              '@pnpm-isolated/scoped-package': '2.3.4',
              'bun-isolated-package': '4.5.6',
              '@bun-isolated/scoped-package': '5.6.7',
            },
          },
        })
        .start()
        .completed();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('ESM', async () => {
    await createRunner(__dirname, 'scenario.mjs')
      .expect({
        event: {
          modules: {
            express: expect.stringMatching(/^4\.\d+\.\d+$/),
            '@sentry/node': SDK_VERSION,
            yargs: expect.stringMatching(/^18\.\d+\.\d+$/),
          },
        },
      })
      .start()
      .completed();
  });

  test('ESM app in a subfolder with its own package.json', async () => {
    const tempDir = makeTempDir();
    const appDir = join(tempDir, 'esm-app');
    cpSync(join(__dirname, 'esm-app'), appDir, { recursive: true });
    const packageDir = join(appDir, 'node_modules', 'esm-app-dependency');
    mkdirSync(packageDir, { recursive: true });
    writeFileSync(join(packageDir, 'package.json'), JSON.stringify({ name: 'esm-app-dependency', version: '1.4.0' }));
    // A CommonJS package that the app imports but does not declare, like a transitive dependency
    const transitiveDir = join(appDir, 'node_modules', 'esm-app-transitive');
    mkdirSync(transitiveDir, { recursive: true });
    writeFileSync(
      join(transitiveDir, 'package.json'),
      JSON.stringify({ name: 'esm-app-transitive', version: '3.1.0' }),
    );
    writeFileSync(join(transitiveDir, 'index.js'), 'module.exports = {};');

    try {
      await createRunner(appDir, 'lib', 'scenario.js')
        .expect({
          event: event => {
            // Packages the SDK itself loads from the repo's node_modules can show up too
            expect(event.modules).toMatchObject({
              'esm-app-dependency': '1.4.0',
              'esm-app-transitive': '3.1.0',
              // Not installed, so the range from package.json is all there is
              'esm-app-missing-dependency': '^2.0.0',
            });
          },
        })
        .start()
        .completed();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
