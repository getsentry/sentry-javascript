import { SDK_VERSION } from '@sentry/core';
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { afterAll, describe, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../utils/runner';

describe('modulesIntegration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('CJS', async () => {
    const runner = createRunner(__dirname, 'server.js')
      .withMockSentryServer()
      .expect({
        event: {
          modules: {
            // exact version comes from require.caches
            express: expect.stringMatching(/^4\.\d+\.\d+$/),
            // this comes from package.json
            '@sentry/node': SDK_VERSION,
            yargs: '^16.2.0',
          },
        },
      })
      .start();
    runner.makeRequest('get', '/test1', { expectError: true });
    await runner.completed();
  });

  test('CJS with the isolated layouts of pnpm and Bun', async () => {
    const nodeModulesDir = join(__dirname, 'node_modules');
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
      await createRunner(__dirname, 'scenario-isolated.js')
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
      rmSync(nodeModulesDir, { recursive: true, force: true });
    }
  });

  test('ESM', async () => {
    const runner = createRunner(__dirname, 'server.mjs')
      .withInstrument(join(__dirname, 'instrument.mjs'))
      .withMockSentryServer()
      .expect({
        event: {
          modules: {
            // this comes from package.json
            express: expect.stringMatching(/^\^4\.\d+\.\d+$/),
            '@sentry/node': SDK_VERSION,
            yargs: '^16.2.0',
          },
        },
      })
      .start();
    runner.makeRequest('get', '/test1', { expectError: true });
    await runner.completed();
  });
});
